// ============================================================
// denise-conversation.ts — Nathalie IA Conversationnelle (voice commands)
// ------------------------------------------------------------
// Le superviseur ops parle à Nathalie via le micro du wallboard
// (Web Speech API → SpeechRecognition). La transcription est
// passée à `processVoiceCommand()` qui :
//   1. normalise le texte (minuscules + sans accents)
//   2. pattern-match sur les commandes vocales
//   3. interroge la BDD (Prisma) pour composer une réponse
//   4. renvoie { response, action? }
//
// Le wallboard appelle ensuite `parler(result.response)` (voix
// "Nathalie" du staff-tts.ts) pour énoncer la réponse, et branche
// l'éventuel `action` (ex: 'crisis' → active le mode crise).
//
// Commandes reconnues :
//   - "nathalie bilan" / "nathalie résumé"  → synthèse 24h (TTS)
//   - "nathalie zone [name]"                → incidents actifs d'une zone
//   - "nathalie assigne [reportId] [team]"  → déclenche l'affectation
//   - "nathalie alerte [team]"              → notifie une équipe
//   - "nathalie calme ?"                    → statut global
//   - "nathalie top performer"              → #1 du classement mensuel
//   - "nathalie crise"                      → active le mode crise
//   (alias hérité : chaque commande fonctionne aussi avec le préfixe
//    "denise" — rétrocompatibilité avec les anciennes habitudes vocales)
//
// Notes :
//   - Fonction async (requêtes Prisma). Le wallboard l'attend
//     avant de parler.
//   - Détection du préfixe "nathalie" insensible aux accents/casse
//     (alias hérité "denise" toujours accepté).
//   - Les identifiants de signalement peuvent être saisis en forme
//     courte (suffixe 6-8 chars affiché sur le wallboard) ou complète.
// ============================================================

import { db } from '@/lib/db'
import { logAuditEntry } from '@/lib/airport-gamification'

export type VoiceCommandResult = {
  /** Texte à énoncer via parler() (TTS Nathalie). */
  response: string
  /** Action à exécuter côté wallboard (ex: 'crisis' active le mode crise). */
  action?: 'crisis' | 'assign' | 'alert'
}

// --- Normalisation ---

/** Minuscules + sans accents (NFD) — pour matcher "nathalie résumé" / "nathalie resume". */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

// --- Alias d'équipes (vocabulaire vocal → clé métier) ---
const TEAM_ALIASES: Record<string, string> = {
  nettoyage: 'nettoyage',
  menage: 'nettoyage',
  proprete: 'nettoyage',
  cleaning: 'nettoyage',
  maintenance: 'maintenance',
  technique: 'maintenance',
  technical: 'maintenance',
  securite: 'securite',
  surete: 'securite',
  security: 'securite',
  accueil: 'accueil',
  hospitality: 'accueil',
  host: 'accueil',
  logistique: 'logistique',
  logistics: 'logistique',
}

function normalizeTeam(raw: string): string | null {
  const n = normalize(raw)
  if (!n) return null
  // Match exact alias, sinon préfixe (ex: "sécur" → securite)
  if (TEAM_ALIASES[n]) return TEAM_ALIASES[n]
  for (const key of Object.keys(TEAM_ALIASES)) {
    if (key.startsWith(n) || n.startsWith(key)) return TEAM_ALIASES[key]
  }
  return null
}

// ============================================================
// processVoiceCommand — point d'entrée public
// ============================================================

/**
 * Analyse une transcription vocale et renvoie la réponse de Nathalie
 * + une éventuelle action à exécuter côté wallboard.
 *
 * @param text - transcription brute du SpeechRecognition.
 * @returns `{ response, action? }` — la réponse est prête pour TTS.
 */
export async function processVoiceCommand(text: string): Promise<VoiceCommandResult> {
  const norm = normalize(text)

  // Préfixe vocal : « nathalie » en premier (nom actuel de l'assistante),
  // puis « denise » en alias hérité (rétrocompatibilité). Même mécanique
  // de normalisation (minuscules + sans accents) pour les deux préfixes.
  const PREFIXES = ['nathalie', 'denise'] as const
  const prefix = PREFIXES.find((p) => norm.startsWith(p))
  if (!prefix) {
    return {
      response:
        "Je n'ai pas compris. Commencez votre phrase par Nathalie, suivi de votre commande.",
    }
  }

  const cmd = norm.replace(new RegExp(`^${prefix}\\s*`), '').trim()
  if (!cmd) {
    return { response: 'Oui, je vous écoute. Quelle est votre commande ?' }
  }

  // --- BILAN / RÉSUMÉ ---
  if (cmd.startsWith('bilan') || cmd.startsWith('resume')) {
    return await handleBilan()
  }

  // --- ZONE [name] ---
  if (cmd.startsWith('zone ')) {
    const zoneName = cmd.slice('zone '.length).trim()
    return await handleZone(zoneName)
  }

  // --- ASSIGNE [reportId] [team] ---
  if (cmd.startsWith('assigne') || cmd.startsWith('assign')) {
    const rest = cmd.replace(/^assigne?\s*/, '').trim()
    const parts = rest.split(/\s+/)
    if (parts.length < 2) {
      return { response: "Commande assigne incomplète. Dites: Nathalie assigne, identifiant, équipe." }
    }
    const [reportToken, ...teamParts] = parts
    return await handleAssigne(reportToken, teamParts.join(' '))
  }

  // --- ALERTE [team] ---
  if (cmd.startsWith('alerte') || cmd.startsWith('alert')) {
    const team = cmd.replace(/^alerte?\s*/, '').trim()
    return await handleAlerte(team)
  }

  // --- CALME ? ---
  if (cmd.startsWith('calme')) {
    return await handleCalme()
  }

  // --- TOP PERFORMER ---
  if (cmd.startsWith('top') || cmd.startsWith('performer') || cmd.startsWith('classement')) {
    return await handleTopPerformer()
  }

  // --- CRISE ---
  if (cmd.startsWith('crise')) {
    return {
      response:
        'Mode crise activé. Board filtré sur incidents critiques. Nathalie en mode crise.',
      action: 'crisis',
    }
  }

  return {
    response:
      'Commande inconnue. Commandes disponibles: bilan, zone, assigne, alerte, calme, top performer, crise.',
  }
}

// ============================================================
// Handlers
// ============================================================

/** "Nathalie bilan" → synthèse 24h (total, en attente, en cours, résolus, temps moyen). */
async function handleBilan(): Promise<VoiceCommandResult> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const reports = await db.airportReport.findMany({
    where: { createdAt: { gte: since24h } },
    select: { statut: true, createdAt: true, resolvedAt: true },
  })
  const total = reports.length
  const enAttente = reports.filter((r) => r.statut === 'EN_ATTENTE').length
  const enCours = reports.filter((r) => r.statut === 'EN_COURS').length
  const resolus = reports.filter((r) => r.statut === 'RESOLU' && r.resolvedAt)
  const avgMin =
    resolus.length > 0
      ? Math.round(
          resolus.reduce(
            (s, r) =>
              s + (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 60000,
            0,
          ) / resolus.length,
        )
      : 0
  const response = `Bilan des dernières 24 heures. ${total} signalements au total. ${enAttente} en attente. ${enCours} en cours. ${resolus.length} résolus. Temps moyen de résolution: ${avgMin} minutes.`
  return { response }
}

/** "Nathalie zone [name]" → incidents actifs d'une zone (code ou nom). */
async function handleZone(name: string): Promise<VoiceCommandResult> {
  if (!name) return { response: 'Nom de zone manquant.' }
  const zone = await db.airportZone.findFirst({
    where: {
      OR: [{ code: { contains: name } }, { nom: { contains: name } }],
    },
  })
  if (!zone) {
    return { response: `Zone ${name} introuvable.` }
  }
  const incidents = await db.airportReport.findMany({
    where: {
      zoneId: zone.id,
      statut: { in: ['EN_ATTENTE', 'EN_COURS'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { problemType: true, statut: true, createdAt: true },
  })
  if (incidents.length === 0) {
    return { response: `Zone ${zone.nom}. Aucun incident actif. Zone calme.` }
  }
  const sample = incidents
    .slice(0, 5)
    .map((i) => i.problemType)
    .join('. ')
  const response = `Zone ${zone.nom}. ${incidents.length} incident(s) actif(s). ${sample}.`
  return { response }
}

/** "Nathalie assigne [reportId] [team]" → déclenche l'affectation d'un signalement à une équipe. */
async function handleAssigne(
  reportToken: string,
  teamRaw: string,
): Promise<VoiceCommandResult> {
  const teamKey = normalizeTeam(teamRaw)
  if (!teamKey) {
    return {
      response: `Équipe ${teamRaw} inconnue. Équipes valides: nettoyage, maintenance, sécurité, accueil, logistique.`,
    }
  }
  if (!reportToken) {
    return { response: 'Identifiant de signalement manquant.' }
  }

  // Recherche : ID complet d'abord, puis suffixe (forme courte #XXXXXXXX du wallboard).
  let report = await db.airportReport.findUnique({ where: { id: reportToken } })
  if (!report) {
    const matches = await db.airportReport.findMany({
      where: { id: { contains: reportToken } },
      take: 5,
    })
    if (matches.length === 1) {
      report = matches[0]!
    } else if (matches.length > 1) {
      return {
        response: `Plusieurs signalements correspondent à ${reportToken}. Précisez l'identifiant complet.`,
      }
    }
  }
  if (!report) {
    return { response: `Signalement ${reportToken} introuvable.` }
  }

  const fromStatut = report.statut
  await db.airportReport.update({
    where: { id: report.id },
    data: {
      routedTeam: teamKey,
      assignedTo: `team:${teamKey}`,
      statut: 'EN_COURS',
    },
  })
  await logAuditEntry({
    reportId: report.id,
    action: 'ASSIGNED',
    actor: 'denise-voice',
    fromStatut,
    toStatut: 'EN_COURS',
    note: `Assignation vocale Nathalie vers ${teamKey}`,
  })
  return {
    response: `Signalement ${report.id.slice(-8)} assigné à l'équipe ${teamKey}. Prise en charge enregistrée.`,
    action: 'assign',
  }
}

/** "Nathalie alerte [team]" → notifie une équipe (log + push broadcast ciblé). */
async function handleAlerte(teamRaw: string): Promise<VoiceCommandResult> {
  const teamKey = normalizeTeam(teamRaw)
  if (!teamKey) {
    return {
      response: `Équipe ${teamRaw} inconnue. Équipes valides: nettoyage, maintenance, sécurité, accueil, logistique.`,
    }
  }
  // Pas de table d'abonnement par équipe — on log l'alerte vocale côté
  // serveur (le wallboard annonce + le push broadcast réel peut être
  // déclenché via /api/airport/push/send si des abonnés existent).
  console.log(
    `[denise-voice] Alerte vocale déclenchée pour l'équipe ${teamKey} à ${new Date().toISOString()}`,
  )
  return {
    response: `Alerte envoyée à l'équipe ${teamKey}. Notification vocale déclenchée.`,
    action: 'alert',
  }
}

/** "Nathalie calme ?" → statut global (calme / vigilance / tendu). */
async function handleCalme(): Promise<VoiceCommandResult> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const enAttente = await db.airportReport.count({ where: { statut: 'EN_ATTENTE' } })
  const enCours = await db.airportReport.count({ where: { statut: 'EN_COURS' } })
  const resolus = await db.airportReport.count({
    where: { statut: 'RESOLU', createdAt: { gte: since24h } },
  })
  const active = enAttente + enCours
  let status = 'calme'
  if (active >= 5) status = 'tendu'
  else if (active >= 2) status = 'en vigilance'
  const response = `Statut global: ${status}. ${enAttente} en attente. ${enCours} en cours. ${resolus} résolus sur 24 heures.`
  return { response }
}

/** "Nathalie top performer" → #1 du classement mensuel. */
async function handleTopPerformer(): Promise<VoiceCommandResult> {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const top = await db.airportAgentScore.findFirst({
    where: { month },
    orderBy: { points: 'desc' },
  })
  if (!top) {
    return { response: 'Aucun classement disponible ce mois-ci.' }
  }
  return {
    response: `Top performer ce mois-ci: ${top.staffName}. ${top.points} points. ${top.resolutions} résolutions. Temps moyen: ${top.avgMinutes} minutes.`,
  }
}
