// ============================================================
// voice-decision-engine.ts — Cerveau vocal de Denise
// ------------------------------------------------------------
// Denise ne parle pas pour chaque événement : elle décide. Ce moteur
// est appelé par :
//   - POST /api/voice/decide (PWA staff + wallboard)
//
// Pipeline (5 étapes) :
//   1. Fetch rule — Récupère VoiceDecisionRule pour (sector, eventType).
//      Si introuvable ou inactive → shouldSpeak=false, reason="no_rule".
//
//   2. Time context — Détermine le mode horaire (opening / service_lunch /
//      quiet / service_dinner / night) depuis VoiceTimeMode.
//        • night (22-06) → uniquement security_sanitary parle. Le reste
//          est silencieux (reason="night_mode_silent").
//        • service_lunch / service_dinner → uniquement critical + important
//          parlent. info est filtré (reason="service_mode_info_filtered").
//
//   3. Aggregation — Si rule.aggregationWindowSec > 0 :
//        • Compte les annonces déjà émises dans la fenêtre pour le même
//          (sector, zoneRef, eventType).
//        • Si count >= maxAnnouncementsPerWindow → shouldSpeak=false,
//          reason="aggregation_suppressed".
//        • MAIS si count >= 3 dans < 180s → upgrade à "important" + message
//          agrégé : "Alerte multiple {zone}. {count} incidents {type}.
//          Renfort nécessaire." (reason="aggregation_upgraded").
//
//   4. Deduplication — Si une annonce du même (sector, zoneRef, eventType)
//      existe déjà dans les 120 dernières secondes ET que la priorité n'a
//      pas été upgradée à l'étape 3 → shouldSpeak=false,
//      reason="deduplication_suppressed".
//      Double-scan : si le même reportId a déjà été annoncé dans les
//      dernières 60s → suppression immédiate
//      (reason="double_scan_suppressed").
//
//   5. Build message + log + return —
//        • Remplace les variables {ZONE}, {TYPE}, {TEMPS}, {TABLE},
//          {PRODUIT}, {DETAIL}, {STAFF_NOM} dans le template.
//        • Ajuste le volume : critical=+20%, important=0%, info=-10%,
//          silent=0% (le log est enregistré mais spoken=false).
//        • Log dans VoiceAnnouncementLog (pour audit + futures dédups).
//        • Retourne le VoiceDecision JSON. Le CLIENT (PWA / wallboard)
//          appelle alors parler() avec le message si shouldSpeak=true.
// ============================================================

import { db } from '@/lib/db'

// ---------- Types publics ----------

export type Sector = 'aeroport' | 'restaurant'
export type Priority = 'critical' | 'important' | 'info' | 'silent'
export type Tone = 'urgent' | 'firm' | 'soft' | 'calm'

export type VoiceEvent = {
  sector: Sector
  eventType: string
  zone?: string
  type?: string
  temps?: string
  table?: string
  produit?: string
  detail?: string
  reportId?: string
  staffName?: string
}

export type VoiceDecision = {
  shouldSpeak: boolean
  priority: Priority
  tone: Tone
  volumeAdjustment: string // "+20%", "0%", "-10%"
  message: string
  targetAudience: string[]
  aggregateId: string | null
  suppressUntil: string | null // ISO timestamp
  reason: string
}

// ---------- Helpers ----------

/**
 * Détermine le mode horaire actuel pour un secteur.
 * Modes possibles : "opening", "service_lunch", "quiet", "service_dinner", "night".
 *
 *   06-10 → opening
 *  10-14  → service_lunch
 *  14-18  → quiet
 *  18-22  → service_dinner
 *  22-06  → night
 *
 * Si VoiceTimeMode existe pour le secteur, on lit les bornes depuis le
 * JSON modes ; sinon on applique les bornes par défaut ci-dessus.
 */
export async function getCurrentTimeMode(sector: Sector): Promise<string> {
  const now = new Date()
  const hour = now.getHours()
  return resolveTimeModeFromHour(sector, hour)
}

export function resolveTimeModeFromHour(sector: Sector, hour: number): string {
  // Bornes par défaut (matches the JSON in VoiceTimeMode.seed).
  // Pour ce calcul on n'a pas besoin d'aller en DB : les bornes par défaut
  // sont 06-10, 10-14, 14-18, 18-22, 22-06.
  void sector
  if (hour >= 6 && hour < 10) return 'opening'
  if (hour >= 10 && hour < 14) return 'service_lunch'
  if (hour >= 14 && hour < 18) return 'quiet'
  if (hour >= 18 && hour < 22) return 'service_dinner'
  return 'night' // 22-06
}

/**
 * Renvoie une raison humainement lisible pour une décision.
 * Utile pour l'admin qui veut comprendre pourquoi Denise s'est tue.
 */
export function getDecisionReason(decision: VoiceDecision): string {
  const map: Record<string, string> = {
    no_rule: "Aucune règle trouvée pour ce couple secteur / événement.",
    rule_inactive: "La règle existe mais est désactivée (active=false).",
    rule_silent: "La règle est configurée en shouldSpeak=false (notification visuelle seule).",
    night_mode_silent:
      "Mode nuit (22h-06h) — seules les alertes sécurité / sanitaire parlent.",
    service_mode_info_filtered:
      "Mode service (déjeuner / dîner) — les annonces info sont filtrées pour ne pas surcharger.",
    quiet_mode_filtered:
      "Mode calme (14h-18h) — les annonces info sont filtrées.",
    aggregation_suppressed:
      "Annonce déjà faite pour cette zone dans la fenêtre d'agrégation.",
    aggregation_upgraded:
      "Multiples signaux rapprochés détectés — annonce agrégée et upgradée en priorité importante.",
    deduplication_suppressed:
      "Annonce identique déjà faite dans les 120 dernières secondes (même zone, même type).",
    double_scan_suppressed:
      "Double scan du même signalement dans les 60 dernières secondes.",
    spoken: "Denise a parlé.",
  }
  return map[decision.reason] ?? decision.reason
}

// ---------- Volume / priority maps ----------

const PRIORITY_VOLUME: Record<Priority, string> = {
  critical: '+20%',
  important: '0%',
  info: '-10%',
  silent: '0%',
}

const PRIORITY_TONE: Record<Priority, Tone> = {
  critical: 'urgent',
  important: 'firm',
  info: 'soft',
  silent: 'calm',
}

const PRIORITY_AUDIENCE: Record<Priority, string[]> = {
  critical: ['staff_all', 'ops', 'wallboard'],
  important: ['staff_assigned', 'ops'],
  info: ['staff_assigned'],
  silent: [],
}

// ---------- Template rendering ----------

/**
 * Remplace les variables {ZONE}, {TYPE}, {TEMPS}, {TABLE}, {PRODUIT},
 * {DETAIL}, {STAFF_NOM} dans le template. Les valeurs manquantes sont
 * remplacées par une chaîne vide.
 */
function renderTemplate(template: string, event: VoiceEvent): string {
  return template
    .replace(/\{ZONE\}/g, event.zone ?? '')
    .replace(/\{TYPE\}/g, event.type ?? '')
    .replace(/\{TEMPS\}/g, event.temps ?? '')
    .replace(/\{TABLE\}/g, event.table ?? '')
    .replace(/\{PRODUIT\}/g, event.produit ?? '')
    .replace(/\{DETAIL\}/g, event.detail ?? '')
    .replace(/\{DÉTAIL\}/g, event.detail ?? '')
    .replace(/\{STAFF_NOM\}/g, event.staffName ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- Main pipeline ----------

/**
 * Cerveau de Denise. À appeler côté serveur quand un événement remonte
 * (PWA staff, wallboard, scanner QR, etc.). Retourne la décision que le
 * CLIENT appliquera (parler ou non, avec quel message / volume / ton).
 *
 * Ne lève jamais d'exception : en cas d'erreur interne, elle renvoie
 * shouldSpeak=false avec reason="internal_error" pour ne jamais bloquer
 * le flux utilisateur.
 */
export async function decideAndSpeak(event: VoiceEvent): Promise<VoiceDecision> {
  try {
    return await decideAndSpeakInner(event)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      shouldSpeak: false,
      priority: 'silent',
      tone: 'calm',
      volumeAdjustment: '0%',
      message: '',
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: `internal_error:${message}`,
    }
  }
}

async function decideAndSpeakInner(event: VoiceEvent): Promise<VoiceDecision> {
  const zoneRef = event.zone ?? event.table ?? 'unknown'
  // ---------- Étape 1 : Fetch rule ----------
  const rule = await db.voiceDecisionRule.findUnique({
    where: {
      sector_eventType: {
        sector: event.sector,
        eventType: event.eventType,
      },
    },
  })

  if (!rule) {
    return logAndReturn({
      event,
      shouldSpeak: false,
      priority: 'silent',
      tone: 'calm',
      volumeAdjustment: '0%',
      message: '',
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: 'no_rule',
      zoneRef,
    })
  }

  if (!rule.active) {
    return logAndReturn({
      event,
      shouldSpeak: false,
      priority: 'silent',
      tone: 'calm',
      volumeAdjustment: '0%',
      message: rule.template,
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: 'rule_inactive',
      zoneRef,
    })
  }

  // Cas trivial : règle configurée pour ne jamais parler.
  if (!rule.shouldSpeak) {
    const message = renderTemplate(rule.template, event)
    return logAndReturn({
      event,
      shouldSpeak: false,
      priority: rule.priority as Priority,
      tone: rule.tone as Tone,
      volumeAdjustment: rule.volumeAdjustment,
      message,
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: 'rule_silent',
      zoneRef,
    })
  }

  // ---------- Étape 2 : Time context ----------
  const now = new Date()
  const hour = now.getHours()
  const timeMode = resolveTimeModeFromHour(event.sector, hour)
  const rulePriority = rule.priority as Priority

  if (timeMode === 'night' && event.eventType !== 'security_sanitary') {
    const message = renderTemplate(rule.template, event)
    return logAndReturn({
      event,
      shouldSpeak: false,
      priority: rulePriority,
      tone: rule.tone as Tone,
      volumeAdjustment: rule.volumeAdjustment,
      message,
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: 'night_mode_silent',
      zoneRef,
    })
  }

  if (
    (timeMode === 'service_lunch' || timeMode === 'service_dinner') &&
    rulePriority === 'info'
  ) {
    const message = renderTemplate(rule.template, event)
    return logAndReturn({
      event,
      shouldSpeak: false,
      priority: rulePriority,
      tone: rule.tone as Tone,
      volumeAdjustment: rule.volumeAdjustment,
      message,
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: 'service_mode_info_filtered',
      zoneRef,
    })
  }

  if (timeMode === 'quiet' && rulePriority === 'info') {
    const message = renderTemplate(rule.template, event)
    return logAndReturn({
      event,
      shouldSpeak: false,
      priority: rulePriority,
      tone: rule.tone as Tone,
      volumeAdjustment: rule.volumeAdjustment,
      message,
      targetAudience: [],
      aggregateId: null,
      suppressUntil: null,
      reason: 'quiet_mode_filtered',
      zoneRef,
    })
  }

  // ---------- Étape 3 : Aggregation ----------
  let finalPriority: Priority = rulePriority
  let aggregateId: string | null = null
  let aggregationReason: string | null = null
  let countInWindow = 0

  if (rule.aggregationWindowSec > 0) {
    const windowStart = new Date(now.getTime() - rule.aggregationWindowSec * 1000)
    const recentLogs = await db.voiceAnnouncementLog.findMany({
      where: {
        sector: event.sector,
        eventType: event.eventType,
        zoneRef,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
    })
    countInWindow = recentLogs.length

    // Escalade : >= 3 annonces dans < 180s → upgrade à important.
    if (countInWindow >= 3 && rule.aggregationWindowSec <= 180) {
      finalPriority = 'important'
      aggregateId = `${event.sector}:${event.eventType}:${zoneRef}:${now.getTime()}`
      aggregationReason = 'aggregation_upgraded'
    } else if (countInWindow >= rule.maxAnnouncementsPerWindow) {
      // Seuil atteint sans escalade → on supprime.
      const message = renderTemplate(rule.template, event)
      const suppressUntil = new Date(
        now.getTime() + rule.aggregationWindowSec * 1000,
      ).toISOString()
      return logAndReturn({
        event,
        shouldSpeak: false,
        priority: rulePriority,
        tone: rule.tone as Tone,
        volumeAdjustment: rule.volumeAdjustment,
        message,
        targetAudience: [],
        aggregateId: null,
        suppressUntil,
        reason: 'aggregation_suppressed',
        zoneRef,
      })
    }
  }

  // ---------- Étape 4 : Deduplication ----------
  // Double-scan : même reportId dans les 60 dernières secondes.
  if (event.reportId) {
    const doubleScanStart = new Date(now.getTime() - 60 * 1000)
    const doubleScan = await db.voiceAnnouncementLog.findFirst({
      where: {
        reportId: event.reportId,
        createdAt: { gte: doubleScanStart },
      },
    })
    if (doubleScan) {
      const message = renderTemplate(rule.template, event)
      return logAndReturn({
        event,
        shouldSpeak: false,
        priority: finalPriority,
        tone: rule.tone as Tone,
        volumeAdjustment: rule.volumeAdjustment,
        message,
        targetAudience: [],
        aggregateId: null,
        suppressUntil: new Date(now.getTime() + 60 * 1000).toISOString(),
        reason: 'double_scan_suppressed',
        zoneRef,
      })
    }
  }

  // Déduplication : même (sector, zoneRef, eventType) dans les 120 dernières
  // secondes. Si la priorité a été upgradée à l'étape 3, on ne supprime pas
  // (l'escalade DOIT parler).
  if (aggregationReason !== 'aggregation_upgraded') {
    const dedupStart = new Date(now.getTime() - 120 * 1000)
    const duplicate = await db.voiceAnnouncementLog.findFirst({
      where: {
        sector: event.sector,
        eventType: event.eventType,
        zoneRef,
        createdAt: { gte: dedupStart },
        spoken: true,
      },
    })
    if (duplicate) {
      const message = renderTemplate(rule.template, event)
      return logAndReturn({
        event,
        shouldSpeak: false,
        priority: finalPriority,
        tone: rule.tone as Tone,
        volumeAdjustment: rule.volumeAdjustment,
        message,
        targetAudience: [],
        aggregateId: null,
        suppressUntil: new Date(now.getTime() + 120 * 1000).toISOString(),
        reason: 'deduplication_suppressed',
        zoneRef,
      })
    }
  }

  // ---------- Étape 5 : Build message + return ----------
  let message = renderTemplate(rule.template, event)

  // Si escalade, on remplace le message par la version agrégée.
  if (aggregationReason === 'aggregation_upgraded') {
    message = `Alerte multiple ${event.zone ?? zoneRef}. ${countInWindow + 1} incidents ${event.type ?? event.eventType}. Renfort nécessaire.`
  }

  // Volume ajusté par priorité finale (l'escalade change le volume).
  const finalVolume =
    finalPriority === rulePriority
      ? rule.volumeAdjustment
      : PRIORITY_VOLUME[finalPriority]

  // Ton ajusté par priorité finale.
  const finalTone =
    finalPriority === rulePriority
      ? (rule.tone as Tone)
      : PRIORITY_TONE[finalPriority]

  return logAndReturn({
    event,
    shouldSpeak: true,
    priority: finalPriority,
    tone: finalTone,
    volumeAdjustment: finalVolume,
    message,
    targetAudience: PRIORITY_AUDIENCE[finalPriority],
    aggregateId,
    suppressUntil: null,
    reason: aggregationReason ?? 'spoken',
    zoneRef,
  })
}

/**
 * Helper : log la décision dans VoiceAnnouncementLog puis retourne la
 * décision. Le log est indispensable pour les étapes 3 (aggregation)
 * et 4 (deduplication) des appels suivants.
 */
async function logAndReturn(
  params: {
    event: VoiceEvent
    shouldSpeak: boolean
    priority: Priority
    tone: Tone
    volumeAdjustment: string
    message: string
    targetAudience: string[]
    aggregateId: string | null
    suppressUntil: string | null
    reason: string
    zoneRef: string
  },
): Promise<VoiceDecision> {
  const {
    event,
    shouldSpeak,
    priority,
    tone,
    volumeAdjustment,
    message,
    targetAudience,
    aggregateId,
    suppressUntil,
    reason,
    zoneRef,
  } = params

  try {
    await db.voiceAnnouncementLog.create({
      data: {
        eventType: event.eventType,
        sector: event.sector,
        message: message || '(silencieux)',
        priority,
        zoneRef,
        reportId: event.reportId ?? null,
        spoken: shouldSpeak,
        reason,
      },
    })
  } catch {
    // Si le log échoue (DB indisponible, contrainte violée), on ne
    // bloque pas la décision — on continue.
  }

  return {
    shouldSpeak,
    priority,
    tone,
    volumeAdjustment,
    message,
    targetAudience,
    aggregateId,
    suppressUntil,
    reason,
  }
}
