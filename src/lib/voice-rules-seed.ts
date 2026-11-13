// ============================================================
// voice-rules-seed.ts — Règles par défaut de la Voice Decision Engine
// ------------------------------------------------------------
// Denise "naît" avec une matrice de règles par secteur. Cette fonction
// est appelée au premier GET /api/admin/voice/rules si la table est
// vide (auto-seed). Elle insère :
//   - 7 règles "aeroport" (security_sanitary, incident_service, new_scan,
//     product_missing, incident_resolved, feedback_positive, staff_connect)
//   - 7 règles "restaurant" (plate_error, service_slow, negative_feedback,
//     product_out_of_stock, feedback_positive, reservation_cancelled,
//     rush_hour)
//
// 2 VoiceTimeMode sont aussi créés (aeroport + restaurant) avec les 5
// modes horaires par défaut :
//   opening (06-10), service_lunch (10-14), quiet (14-18),
//   service_dinner (18-22), night (22-06).
//
// Une fois seedés, l'admin peut tout éditer depuis l'onglet "Voix Denise".
// ============================================================

import { db } from '@/lib/db'

type RuleSeed = {
  sector: string
  eventType: string
  shouldSpeak: boolean
  priority: string
  tone: string
  volumeAdjustment: string
  template: string
  aggregationWindowSec: number
  maxAnnouncementsPerWindow: number
  active: boolean
}

const AEROPORT_RULES: RuleSeed[] = [
  {
    sector: 'aeroport',
    eventType: 'security_sanitary',
    shouldSpeak: true,
    priority: 'critical',
    tone: 'urgent',
    volumeAdjustment: '+20%',
    template:
      'ALERTE SÉCURITÉ. {ZONE}. Intervention immédiate requise.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'aeroport',
    eventType: 'incident_service',
    shouldSpeak: true,
    priority: 'important',
    tone: 'firm',
    volumeAdjustment: '0%',
    template:
      "Attention équipe. Incident {TYPE} à {ZONE}. En attente depuis {TEMPS}.",
    aggregationWindowSec: 180,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'aeroport',
    eventType: 'new_scan',
    shouldSpeak: true,
    priority: 'info',
    tone: 'soft',
    volumeAdjustment: '-10%',
    template: 'Nouvel incident signalé {ZONE}. Type: {TYPE}.',
    aggregationWindowSec: 300,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'aeroport',
    eventType: 'product_missing',
    shouldSpeak: true,
    priority: 'important',
    tone: 'firm',
    volumeAdjustment: '0%',
    template:
      'Rupture stock {PRODUIT} à {ZONE}. Réapprovisionnement urgent.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'aeroport',
    eventType: 'incident_resolved',
    shouldSpeak: false,
    priority: 'silent',
    tone: 'calm',
    volumeAdjustment: '0%',
    template: 'Incident résolu {ZONE}.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'aeroport',
    eventType: 'feedback_positive',
    shouldSpeak: false,
    priority: 'silent',
    tone: 'soft',
    volumeAdjustment: '0%',
    template: 'Feedback positif reçu.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'aeroport',
    eventType: 'staff_connect',
    shouldSpeak: false,
    priority: 'silent',
    tone: 'soft',
    volumeAdjustment: '0%',
    template: 'Connexion staff {STAFF_NOM}.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
]

const RESTAURANT_RULES: RuleSeed[] = [
  {
    sector: 'restaurant',
    eventType: 'plate_error',
    shouldSpeak: true,
    priority: 'critical',
    tone: 'urgent',
    volumeAdjustment: '+20%',
    template:
      'URGENCE CUISINE. Table {TABLE}. {DETAIL}. Vérification immédiate.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'restaurant',
    eventType: 'service_slow',
    shouldSpeak: true,
    priority: 'important',
    tone: 'firm',
    volumeAdjustment: '0%',
    template:
      'Alerte service. Table {TABLE} attend depuis {TEMPS}. Priorité table {TABLE}.',
    aggregationWindowSec: 300,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'restaurant',
    eventType: 'negative_feedback',
    shouldSpeak: true,
    priority: 'info',
    tone: 'soft',
    volumeAdjustment: '-10%',
    template:
      'Nouveau feedback négatif table {TABLE}. À consulter au prochain passage.',
    aggregationWindowSec: 600,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'restaurant',
    eventType: 'product_out_of_stock',
    shouldSpeak: true,
    priority: 'important',
    tone: 'firm',
    volumeAdjustment: '0%',
    template:
      "Info cuisine. {PRODUIT} épuisé. Mettre à jour ardoise / menu.",
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'restaurant',
    eventType: 'feedback_positive',
    shouldSpeak: false,
    priority: 'silent',
    tone: 'soft',
    volumeAdjustment: '0%',
    template: 'Feedback positif reçu.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'restaurant',
    eventType: 'reservation_cancelled',
    shouldSpeak: false,
    priority: 'silent',
    tone: 'soft',
    volumeAdjustment: '0%',
    template: 'Réservation annulée.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
  {
    sector: 'restaurant',
    eventType: 'rush_hour',
    shouldSpeak: false,
    priority: 'silent',
    tone: 'calm',
    volumeAdjustment: '0%',
    template: 'Mode rush activé. Denise silencieuse.',
    aggregationWindowSec: 0,
    maxAnnouncementsPerWindow: 1,
    active: true,
  },
]

const ALL_RULES: RuleSeed[] = [...AEROPORT_RULES, ...RESTAURANT_RULES]

const DEFAULT_MODES_JSON =
  '{"06-10":"opening","10-14":"service_lunch","14-18":"quiet","18-22":"service_dinner","22-06":"night"}'

/**
 * Idempotent seed : insère les règles par défaut + les 2 VoiceTimeMode
 * si elles n'existent pas encore. Utilise upsert sur la contrainte
 * @@unique([sector, eventType]).
 */
export async function seedVoiceRulesIfEmpty(): Promise<void> {
  const existingCount = await db.voiceDecisionRule.count()
  if (existingCount > 0) return

  for (const rule of ALL_RULES) {
    await db.voiceDecisionRule.upsert({
      where: {
        sector_eventType: {
          sector: rule.sector,
          eventType: rule.eventType,
        },
      },
      update: {},
      create: { ...rule },
    })
  }

  // Seed VoiceTimeMode for both sectors
  for (const sector of ['aeroport', 'restaurant']) {
    await db.voiceTimeMode.upsert({
      where: { sector },
      update: {},
      create: { sector, modes: DEFAULT_MODES_JSON, active: true },
    })
  }
}
