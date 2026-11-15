// ============================================================
// FeedbackPro — WhatsApp Bot 2.0 Conversational (Task F3)
// ------------------------------------------------------------
// Version enrichie du bot ops aéroport. Au lieu d'exiger des
// commandes strictes ("/zone bagages"), le bot comprend le
// langage naturel français : "bilan", "résumé du jour",
// "incidents zone sanitaires", "assigne abc12345 à nettoyage"…
//
// Sécurité : seuls les numéros présents dans AirportOpsContact
// (actif=true) reçoivent une réponse. Les autres numéros sont
// rejetés poliment.
//
// Le webhook (/api/airport/whatsapp-webhook) délègue à
// processWhatsAppMessage(phone, message) qui renvoie un objet
// { reply, action? } — reply est le texte WhatsApp renvoyé,
// action est un tag métier ("assign", "resolve", "alert") pour
// audit/escalade côté webhook.
//
// Commandes supportées :
//   • bilan | résumé | rapport     → synthèse quotidienne (24h)
//   • zone <nom|code>              → incidents de la zone
//   • incident <id>                → détail d'un signalement
//   • assigne <id> <équipe>        → affectation à une équipe
//   • stats                        → KPI synthétiques
//   • aide                         → liste des commandes
//   • calme ?                      → statut global (tout va bien ?)
//   • (non reconnu)                → message d'aide par défaut
// ============================================================

import { db } from '@/lib/db'
import { AIRPORT_ZONES, getZoneParCode } from '@/lib/airport-config'
import { getAllTeams } from '@/lib/sector-routing'

export type WhatsAppBotResult = {
  reply: string
  /** Tag métier optionnel pour audit (ex: "assign", "alert", "help"). */
  action?: string
}

// ----------------------------------------------------------------
// Helpers de formatage WhatsApp
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
// Autorisation : whitelist AirportOpsContact actifs
// ----------------------------------------------------------------

async function checkAuthorization(phone: string): Promise<boolean> {
  const contact = await db.airportOpsContact.findUnique({ where: { phone } })
  return !!contact && contact.actif === true
}

// ----------------------------------------------------------------
// Parsing langage naturel
// ----------------------------------------------------------------

/**
 * Normalise le texte saisi par l'ops :
 *   - retire les accents (compatible "résumé" / "resume")
 *   - lowercase
 *   - retire la ponctuation excédentaire
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Teste si le texte contient au moins un des mots-clés (formule positive). */
function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k))
}

/**
 * Détecte une zone dans le message en langage naturel. On teste
 * plusieurs stratégies :
 *   1. Code exact ("zone bagages")
 *   2. Nom partiel ("zone sanitaires", "zones d'embarquement")
 *   3. Mot-clé approximatif ("toilettes" → sanitaires, "gates" → embarquement)
 */
function detectZone(text: string): { code: string; nom: string; emoji: string } | null {
  const lower = normalize(text)
  // Stratégie 1 : code exact — "zone bagages", "zone sanitaires"
  for (const z of AIRPORT_ZONES) {
    if (lower.includes(`zone ${z.code}`)) {
      return { code: z.code, nom: z.nom, emoji: z.emoji }
    }
  }
  // Stratégie 2 : nom partiel — "zone livraison", "zone sanitaires"
  for (const z of AIRPORT_ZONES) {
    const nomNorm = normalize(z.nom)
    // On garde les 2 premiers mots du nom ("Livraison des Bagages" → "livraison des")
    const tokens = nomNorm.split(/\s+/).slice(0, 2).join(' ')
    if (tokens.length >= 4 && lower.includes(tokens)) {
      return { code: z.code, nom: z.nom, emoji: z.emoji }
    }
  }
  // Stratégie 3 : synonymes usuels
  const SYNONYMES: Record<string, string> = {
    toilettes: 'sanitaires',
    wc: 'sanitaires',
    soin: 'sanitaires',
    bagage: 'bagages',
    valise: 'bagages',
    tapis: 'bagages',
    file: 'files_attente',
    attente: 'files_attente',
    queue: 'files_attente',
    embarquement: 'embarquement',
    gate: 'embarquement',
    porte: 'embarquement',
    resto: 'restauration',
    restaurant: 'restauration',
    boutique: 'restauration',
    parking: 'ext_park_p1',
    depose: 'ext_depose_min',
    taxi: 'ext_taxi_off',
    bus: 'ext_transport_pub',
    vtc: 'ext_transport_pub',
    surete: 'sec_filt_std',
    filtrage: 'sec_filt_std',
    paf: 'sec_paf',
    police: 'sec_paf',
    frontiere: 'sec_paf',
  }
  for (const [kw, code] of Object.entries(SYNONYMES)) {
    if (lower.includes(kw)) {
      const z = getZoneParCode(code)
      if (z) return { code: z.code, nom: z.nom, emoji: z.emoji }
    }
  }
  return null
}

/**
 * Extrait un short-id ou un ID complet depuis le message.
 * Accepte les formats :
 *   "incident abc12345", "inc abc12345", "#abc12345", "incident 12345"
 */
function extractId(text: string): string | null {
  // Match un token alphanumérique de 4-12 chars après "incident" / "signalement" / "#"
  const m = text.match(/(?:incident|signalement|rapport|sig|#)\s*([a-z0-9]{4,12})/i)
  if (m && m[1]) return m[1]
  // Sinon on cherche un token alphanumérique isolé (au cas où l'ops a juste tapé l'ID)
  const m2 = text.match(/\b([a-z0-9]{6,12})\b/i)
  if (m2 && m2[1]) return m2[1]
  return null
}

/**
 * Extrait un nom d'équipe depuis un message "assigne <id> à nettoyage".
 */
function extractTeam(text: string): string | null {
  const teams = getAllTeams()
  const lower = normalize(text)
  for (const t of teams) {
    if (lower.includes(t)) return t
  }
  return null
}

// ----------------------------------------------------------------
// Commandes
// ----------------------------------------------------------------

const HELP_TEXT = `*🤖 Bot Ops Aéroport 2.0*

Je comprends le langage naturel. Exemples :

• _bilan_ ou _résumé_ — synthèse 24h
• _zone sanitaires_ — incidents d'une zone
• _incident abc12345_ — détail d'un signalement
• _assigne abc12345 nettoyage_ — affecter une équipe
• _stats_ — KPI 24h
• _calme ?_ — statut global
• _aide_ — cette aide

Zones : ${AIRPORT_ZONES.slice(0, 6).map((z) => z.code).join(', ')}…

Équipes : ${getAllTeams().join(', ')}`

async function cmdBilan(): Promise<WhatsAppBotResult> {
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [total, enAttente, enCours, resolus, topZones] = await Promise.all([
    db.airportReport.count({ where: { createdAt: { gte: since } } }),
    db.airportReport.count({ where: { statut: 'EN_ATTENTE' } }),
    db.airportReport.count({ where: { statut: 'EN_COURS' } }),
    db.airportReport.count({ where: { statut: 'RESOLU', resolvedAt: { gte: since } } }),
    db.airportReport.groupBy({
      by: ['zoneId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { zoneId: 'desc' } },
      take: 3,
    }),
  ])

  // Résolution des noms de zones pour le top
  const topZoneNames = await Promise.all(
    topZones.map(async (g) => {
      const z = await db.airportZone.findUnique({
        where: { id: g.zoneId },
        select: { code: true, nom: true, emoji: true },
      })
      return { ...z, count: g._count._all }
    }),
  )

  const lignes = [
    '*📊 Bilan 24h — Aéroport*',
    '',
    `📝 Signalements : *${total}*`,
    `🟡 En attente : *${enAttente}*`,
    `🔵 En cours : *${enCours}*`,
    `🟢 Résolus : *${resolus}*`,
    '',
    '*Top 3 zones :*',
  ]
  if (topZoneNames.length === 0) {
    lignes.push('_(aucun signalement)_')
  } else {
    topZoneNames.forEach((z, i) => {
      if (z?.code) {
        lignes.push(`${i + 1}. ${z.emoji} ${z.nom} — *${z.count}*`)
      }
    })
  }
  if (enAttente > 0) {
    lignes.push('', '_→ tapez "stats" pour le détail_')
  }
  return { reply: lignes.join('\n') }
}

async function cmdZone(zoneInfo: {
  code: string
  nom: string
  emoji: string
}): Promise<WhatsAppBotResult> {
  const zone = await db.airportZone.findUnique({ where: { code: zoneInfo.code } })
  if (!zone) {
    return { reply: `⚠️ Zone *${zoneInfo.code}* non initialisée en base.` }
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [enAttente, enCours, resolu, recents] = await Promise.all([
    db.airportReport.count({ where: { zoneId: zone.id, statut: 'EN_ATTENTE' } }),
    db.airportReport.count({ where: { zoneId: zone.id, statut: 'EN_COURS' } }),
    db.airportReport.count({
      where: { zoneId: zone.id, statut: 'RESOLU', createdAt: { gte: since } },
    }),
    db.airportReport.findMany({
      where: { zoneId: zone.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { zone: { select: { code: true, nom: true, emoji: true } } },
    }),
  ])

  const lignes = [
    `${zoneInfo.emoji} *${zoneInfo.nom}*`,
    '',
    `*Bilan :* 🟡 ${enAttente} · 🔵 ${enCours} · 🟢 ${resolu} (24h)`,
    '',
    '*3 derniers signalements :*',
  ]
  if (recents.length === 0) {
    lignes.push('_(aucun)_')
  } else {
    for (const r of recents) {
      lignes.push(`• ${formatStatut(r.statut)} ${shortId(r.id)} — ${truncate(r.problemType, 50)}`)
      lignes.push(`  ${formatDateFr(r.createdAt)} · _incident ${shortId(r.id)}_`)
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
  // Tentative 2 : short id (suffixe)
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

async function cmdIncident(idOrShort: string): Promise<WhatsAppBotResult> {
  const report = await findReportByIdOrShort(idOrShort)
  if (!report) {
    return {
      reply: `⚠️ Signalement introuvable : *${idOrShort}*

Astuce : tapez _bilan_ pour voir les derniers signalements.`,
    }
  }
  if ('ambiguous' in report) {
    const lignes = [
      `⚠️ ${report.count} signalements correspondent à *${idOrShort}*. Soyez plus précis :`,
      '',
      ...report.ids.slice(0, 5).map((id) => `• _incident ${id}_`),
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
  if (r.resolvedAt) lignes.push(`*Résolu :* ${formatDateFr(r.resolvedAt)}`)
  if (r.routedTeam) lignes.push(`*Équipe routée :* ${r.routedTeam}`)
  if (r.assignedTo) lignes.push(`*Assigné à :* ${r.assignedTo}`)
  if (r.flightNumber) lignes.push(`*Vol :* ${r.flightNumber}`)
  if (r.commentaire) lignes.push(`*Précision :* _${truncate(r.commentaire, 200)}_`)
  if (r.statut !== 'RESOLU') {
    lignes.push('', `→ _assigne ${shortId(r.id)} <équipe>_`)
  }
  return { reply: lignes.join('\n') }
}

async function cmdAssigne(
  idOrShort: string,
  team: string | null,
  phone: string,
): Promise<WhatsAppBotResult> {
  if (!team) {
    return {
      reply: `⚠️ Équipe manquante. Syntaxe : _assigne <id> <équipe>_

Équipes valides : ${getAllTeams().join(', ')}`,
    }
  }
  const report = await findReportByIdOrShort(idOrShort)
  if (!report) {
    return {
      reply: `⚠️ Signalement introuvable : *${idOrShort}*`,
    }
  }
  if ('ambiguous' in report) {
    return {
      reply: `⚠️ Plusieurs signalements correspondent à *${idOrShort}*. Précisez l'ID complet.`,
    }
  }

  // Marque le signalement comme assigné à l'équipe + EN_COURS si EN_ATTENTE
  const newStatut = report.statut === 'EN_ATTENTE' ? 'EN_COURS' : report.statut
  await db.airportReport.update({
    where: { id: report.id },
    data: {
      assignedTo: team,
      routedTeam: team,
      statut: newStatut,
    },
  })

  // Audit trail
  await db.airportAuditTrail.create({
    data: {
      reportId: report.id,
      action: 'ASSIGNED',
      actor: phone,
      fromStatut: report.statut,
      toStatut: newStatut,
      note: `Affectation équipe ${team} (bot WhatsApp)`,
    },
  })

  console.log(
    `[whatsapp-bot-ai] assigne ${report.id} → ${team} par ${phone}`,
  )

  return {
    reply: `✅ *Affectation confirmée*

Signalement ${shortId(report.id)}
${report.zone.emoji} ${report.zone.nom}
${report.problemType}
Équipe : *${team}*
Statut : ${formatStatut(newStatut)}`,
    action: 'assign',
  }
}

async function cmdStats(): Promise<WhatsAppBotResult> {
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [total, enAttente, enCours, resolus] = await Promise.all([
    db.airportReport.count({ where: { createdAt: { gte: since } } }),
    db.airportReport.count({ where: { statut: 'EN_ATTENTE' } }),
    db.airportReport.count({ where: { statut: 'EN_COURS' } }),
    db.airportReport.count({
      where: { statut: 'RESOLU', resolvedAt: { gte: since } },
    }),
  ])
  const resolusWithDates = await db.airportReport.findMany({
    where: {
      statut: 'RESOLU',
      resolvedAt: { gte: since },
      createdAt: { gte: since },
    },
    select: { createdAt: true, resolvedAt: true },
  })
  let avgMin: number | null = null
  if (resolusWithDates.length > 0) {
    const totalMs = resolusWithDates.reduce((sum, r) => {
      const created = r.createdAt.getTime()
      const resolved = r.resolvedAt?.getTime() ?? created
      return sum + Math.max(0, resolved - created)
    }, 0)
    avgMin = Math.round(totalMs / resolusWithDates.length / 60000)
  }
  const lignes = [
    '*📈 KPI 24h*',
    '',
    `📝 Total : *${total}*`,
    `🟡 En attente : *${enAttente}*`,
    `🔵 En cours : *${enCours}*`,
    `🟢 Résolus : *${resolus}*`,
  ]
  if (avgMin !== null) {
    lignes.push(`⏱️ Temps moyen : *${avgMin} min*`)
  } else {
    lignes.push('⏱️ Temps moyen : _n/a_')
  }
  // Taux de résolution
  if (total > 0) {
    const taux = Math.round((resolus / total) * 100)
    lignes.push(`🎯 Taux résolution : *${taux}%*`)
  }
  return { reply: lignes.join('\n') }
}

async function cmdCalme(): Promise<WhatsAppBotResult> {
  const enAttente = await db.airportReport.count({ where: { statut: 'EN_ATTENTE' } })
  const enCours = await db.airportReport.count({ where: { statut: 'EN_COURS' } })
  const since = new Date(Date.now() - 60 * 60 * 1000)
  const recents1h = await db.airportReport.count({
    where: { createdAt: { gte: since } },
  })

  if (enAttente === 0 && enCours === 0) {
    return {
      reply: `😌 *Tout est calme.*

Aucun signalement en attente ni en cours.
${recents1h > 0 ? `${recents1h} incident(s) résolu(s) dans la dernière heure.` : 'Aucune activité dans la dernière heure.'}`,
      action: 'calm',
    }
  }
  return {
    reply: `🔴 *Situation active*

🟡 En attente : *${enAttente}*
🔵 En cours : *${enCours}*
📝 Nouveaux (1h) : *${recents1h}*

→ tapez _bilan_ pour le détail`,
    action: 'active',
  }
}

// ----------------------------------------------------------------
// Point d'entrée principal
// ----------------------------------------------------------------

/**
 * Traite un message WhatsApp entrant et renvoie la réponse à envoyer.
 *
 * @param phone   Numéro international sans "+" (ex: "33612345678")
 * @param message Texte brut reçu de l'ops
 * @returns { reply: string, action?: string } — reply = texte WhatsApp
 */
export async function processWhatsAppMessage(
  phone: string,
  message: string,
): Promise<WhatsAppBotResult> {
  try {
    // 1. Autorisation
    const authorized = await checkAuthorization(phone)
    if (!authorized) {
      return {
        reply:
          '⛔ Numéro non autorisé. Contactez l\'administrateur de l\'aéroport pour être ajouté à la liste ops.',
      }
    }

    const raw = (message ?? '').trim()
    if (!raw) {
      return { reply: "Message vide. Tapez *aide* pour voir les commandes." }
    }

    const text = normalize(raw)

    // 2. Aide
    if (containsAny(text, ['aide', 'help', 'commande', 'commandes'])) {
      return { reply: HELP_TEXT, action: 'help' }
    }

    // 3. Bilan / résumé / rapport
    if (containsAny(text, ['bilan', 'resume', 'rapport', 'synthese', 'recap', 'recapitulatif'])) {
      return await cmdBilan()
    }

    // 4. Calme ?
    if (containsAny(text, ['calme', 'tranquille', 'status', 'statut global', 'situation'])) {
      return await cmdCalme()
    }

    // 5. Stats
    if (text === 'stats' || containsAny(text, ['kpi', 'statistique', 'statistiques'])) {
      return await cmdStats()
    }

    // 6. Assigne <id> <team>
    if (containsAny(text, ['assigne', 'assign', 'affecte', 'affecter', 'attribue'])) {
      const id = extractId(text)
      const team = extractTeam(text)
      if (!id) {
        return {
          reply: `⚠️ Usage : _assigne <id> <équipe>_

Exemple : _assigne abc12345 nettoyage_
Équipes : ${getAllTeams().join(', ')}`,
        }
      }
      return await cmdAssigne(id, team, phone)
    }

    // 7. Incident <id>
    if (containsAny(text, ['incident', 'signalement', 'rapport ', 'sig ', 'detail'])) {
      const id = extractId(text)
      if (id) return await cmdIncident(id)
      return {
        reply:
          '⚠️ Usage : _incident <id>_\n\nExemple : _incident abc12345_',
      }
    }

    // 8. Zone <name>
    if (containsAny(text, ['zone', 'secteur', 'emplacement'])) {
      const z = detectZone(text)
      if (z) return await cmdZone(z)
      return {
        reply: `⚠️ Zone non reconnue. Codes valides : ${AIRPORT_ZONES.slice(0, 8)
          .map((z) => z.code)
          .join(', ')}…

Astuce : "zone sanitaires", "zone bagages", "zone embarquement"…`,
      }
    }

    // 9. Détecte un ID brut (8+ chars alphanumériques) sans commande explicite
    // → suppose que l'ops veut le détail d'un signalement
    const bareId = extractId(text)
    if (bareId && bareId.length >= 6 && /^[a-z0-9]+$/i.test(text.replace(/\s+/g, ''))) {
      return await cmdIncident(bareId)
    }

    // 10. Commande non reconnue
    return {
      reply: "Je n'ai pas compris. Tapez *aide* pour voir les commandes.",
    }
  } catch (err) {
    console.error('[whatsapp-bot-ai] Erreur traitement message :', err)
    return {
      reply: "⚠️ Erreur temporaire, réessayez. Si le problème persiste, contactez l'administrateur.",
    }
  }
}
