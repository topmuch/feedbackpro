// ============================================================
// Seed: Notification templates per project
// Run: npx tsx scripts/seed-notifications.ts
// ============================================================

import { db } from '../src/lib/db'

const TEMPLATES = [
  // === AIRPORT ===
  { trigger: 'new_incident', label: 'Nouvel incident aéroport', tenantType: 'airport', channels: '["push_pwa","email"]', recipient: 'terminal_staff', template: 'Incident {TYPE} à {ZONE}. Lien: {LIEN_DIRECT}', description: 'Nouvel incident signalé par un voyageur via QR code', active: true },
  { trigger: 'assigned', label: 'Incident assigné', tenantType: 'airport', channels: '["push_pwa","email"]', recipient: 'assigned_staff', template: 'Incident {INCIDENT_ID} assigné à {STAFF_NOM}. Zone: {ZONE}', description: 'Un manager a assigné un incident à un agent', active: true },
  { trigger: 'resolved', label: 'Incident résolu', tenantType: 'airport', channels: '["push_pwa","email"]', recipient: 'supervisor', template: 'Incident {INCIDENT_ID} résolu en {TEMPS}. Zone: {ZONE}', description: 'Un incident a été marqué comme résolu', active: true },
  { trigger: 'escalation_15min', label: 'Escalade 15 min', tenantType: 'airport', channels: '["sms_mtarget","push_pwa"]', recipient: 'supervisor', template: 'URGENT: Incident {INCIDENT_ID} non traité depuis 15 min. Zone: {ZONE}', description: 'Incident non résolu depuis 15 minutes', active: true },
  { trigger: 'escalation_30min', label: 'Escalade 30 min', tenantType: 'airport', channels: '["sms_mtarget","email","whatsapp"]', recipient: 'supervisor', template: 'CRITIQUE: Incident {INCIDENT_ID} non traité depuis 30 min. Zone: {ZONE}', description: 'Incident non résolu depuis 30 minutes', active: true },
  { trigger: 'help_request', label: 'Demande d\'aide voyageur', tenantType: 'airport', channels: '["whatsapp","sms_mtarget"]', recipient: 'terminal_staff', template: 'Voyageur demande aide à {ZONE}. Type: {TYPE}', description: 'Un voyageur a appuyé sur le bouton Aide', active: true },

  // === CITY (Ville Connectée) ===
  { trigger: 'city_new_rdv', label: 'Nouveau rendez-vous citoyen', tenantType: 'city', channels: '["email"]', recipient: 'secretariat', template: 'Nouveau RDV demandé par {NAME}. Motif: {MOTIF}. Réf: {REFERENCE}', description: 'Un citoyen a demandé un RDV via QR code', active: true },
  { trigger: 'city_new_incident', label: 'Nouveau signalement citoyen', tenantType: 'city', channels: '["push_pwa","whatsapp"]', recipient: 'assigned_staff', template: 'Signalement {TYPE} - {CATEGORY}. Plaque: {PLATE}. {DESCRIPTION}', description: 'Un citoyen a signalé un incident (voirie, éclairage, etc.)', active: true },
  { trigger: 'city_incident_resolved', label: 'Signalement résolu', tenantType: 'city', channels: '["whatsapp"]', recipient: 'citizen', template: 'Votre signalement {CATEGORY} a été résolu par {SERVICE}. Merci!', description: 'Un signalement a été marqué comme résolu', active: true },
  { trigger: 'city_escalation_24h', label: 'Escalade 24h sans résolution', tenantType: 'city', channels: '["email","sms_mtarget"]', recipient: 'director', template: 'URGENT: {COUNT} signalements non résolus depuis 24h. Quartiers: {ZONES}', description: 'Signalements non résolus depuis plus de 24 heures', active: true },
  { trigger: 'city_daily_report', label: 'Rapport quotidien mairie', tenantType: 'city', channels: '["email"]', recipient: 'manager', template: 'Rapport quotidien: {TOTAL} incidents, {RESOLVED} résolus, {PENDING} en attente', description: 'Rapport quotidien envoyé à la mairie chaque matin', active: true },
  { trigger: 'city_new_business', label: 'Nouveau commerce inscrit', tenantType: 'city', channels: '["email","bell"]', recipient: 'manager', template: 'Nouveau commerce: {NAME} ({CATEGORY}). Plan: {PLAN}', description: 'Un commerce s\'est inscrit via le QR code', active: true },
  { trigger: 'city_sos_silent', label: 'SOS silencieux déclenché', tenantType: 'city', channels: '["sms_mtarget","push_pwa"]', recipient: 'assigned_staff', template: 'SOS SILENCIEUX déclenché. Plaque: {PLATE}. GPS: {GPS}. Photo capturée.', description: 'Un citoyen a déclenché un SOS silencieux (appui long)', active: true },

  // === VIP LOUNGE ===
  { trigger: 'vip_new_request', label: 'Nouvelle demande client VIP', tenantType: 'vip_lounge', channels: '["push_pwa"]', recipient: 'assigned_staff', template: 'Demande {TYPE} - Table {TABLE}. Client: {CLIENT}', description: 'Un client VIP a fait une demande (boisson, douche, etc.)', active: true },
  { trigger: 'vip_problem_escalation', label: 'Problème escaladé VIP (>15min)', tenantType: 'vip_lounge', channels: '["email"]', recipient: 'manager', template: 'Problème VIP non résolu depuis 15 min. Table: {TABLE}. Type: {TYPE}', description: 'Une demande de type problème non résolue depuis 15 minutes', active: true },
  { trigger: 'vip_arrival', label: 'VIP reconnu (Gold/Platinum)', tenantType: 'vip_lounge', channels: '["push_pwa"]', recipient: 'assigned_staff', template: 'VIP {TIER} arrivé: {NAME}. Table: {TABLE}. Préférences: {PREFERENCES}', description: 'Un client VIP Gold/Platinum/Diamond a été reconnu', active: true },
  { trigger: 'vip_lost_found', label: 'Objet perdu restitué', tenantType: 'vip_lounge', channels: '["email"]', recipient: 'citizen', template: 'Votre objet "{ITEM}" a été retrouvé. Contactez le salon pour le récupérer.', description: 'Un objet perdu a été matché et restitué', active: true },
  { trigger: 'vip_monthly_report', label: 'Rapport mensuel salon VIP', tenantType: 'vip_lounge', channels: '["email"]', recipient: 'manager', template: 'Rapport mensuel: {REQUESTS} demandes, {SATISFACTION}/5 satisfaction', description: 'Rapport mensuel envoyé au manager du salon', active: true },

  // === CLASSIC (Restaurants, Hôtels, Commerce) ===
  { trigger: 'classic_negative_return', label: 'Retour négatif', tenantType: 'classic', channels: '["bell","sms_mtarget","email"]', recipient: 'manager', template: 'Retour négatif {RATING}★ - {ZONE}. Commentaire: {COMMENT}', description: 'Un client a laissé un retour négatif (≤2 étoiles)', active: true },
  { trigger: 'classic_recurring', label: 'Pattern récurrent (≥3/48h)', tenantType: 'classic', channels: '["sms_mtarget","email"]', recipient: 'manager', template: 'ALERTE: {COUNT} retours négatifs en 48h sur {ZONE}. Pattern: {PATTERN}', description: 'Pattern récurrent de retours négatifs détecté', active: true },
  { trigger: 'classic_ia_report', label: 'Rapport IA généré', tenantType: 'classic', channels: '["email"]', recipient: 'manager', template: 'Rapport IA disponible. Score: {SCORE}. Recommandations: {RECOMMANDATIONS}', description: 'Le Coach IA a généré un rapport quotidien', active: true },
  { trigger: 'classic_subscription_expiring', label: 'Abonnement expirant (-7j)', tenantType: 'classic', channels: '["email"]', recipient: 'manager', template: 'Votre abonnement expire dans {DAYS} jours. Renouvelez pour éviter l\'interruption.', description: 'Abonnement Pro arrive à échéance dans 7 jours', active: true },
  { trigger: 'classic_rattrapage', label: 'Rappel rattrapage 24h', tenantType: 'classic', channels: '["email"]', recipient: 'citizen', template: 'Suite à votre retour négatif, le manager s\'en est occupé. Êtes-vous satisfait?', description: 'Email de suivi 24h après un rattrapage', active: true },
  { trigger: 'classic_weekly_recap', label: 'Recap hebdomadaire', tenantType: 'classic', channels: '["email"]', recipient: 'manager', template: 'Recap semaine: {RETURNS} retours, {POSITIVE}% positifs, {AVG_RATING}★ moyenne', description: 'Récapitulatif hebdomadaire envoyé chaque lundi', active: true },

  // === AIRLINE ===
  { trigger: 'airline_new_incident', label: 'Nouvel incident compagnie', tenantType: 'airline', channels: '["push_pwa","email"]', recipient: 'manager', template: 'Incident compagnie: {TYPE}. Vol: {FLIGHT}. Gate: {GATE}', description: 'Nouvel incident signalé pour une compagnie aérienne', active: true },
  { trigger: 'airline_baggage_dispute', label: 'Litige bagage créé', tenantType: 'airline', channels: '["push_pwa"]', recipient: 'assigned_staff', template: 'Litige bagage: {BAG_TAG}. Client: {NAME}. Vol: {FLIGHT}', description: 'Un litige bagage a été créé', active: true },
  { trigger: 'airline_baggage_escalated', label: 'Litige bagage escaladé', tenantType: 'airline', channels: '["email","sms_mtarget"]', recipient: 'manager', template: 'Litige bagage escaladé: {BAG_TAG}. Durée: {DURATION}. Client mécontent.', description: 'Un litige bagage a été escaladé au duty manager', active: true },
  { trigger: 'airline_dissatisfaction_alert', label: 'Alerte mécontentement >10min', tenantType: 'airline', channels: '["email"]', recipient: 'manager', template: 'Alerte: {COUNT} incidents non résolus >10 min. Gates: {GATES}', description: 'Plusieurs incidents non résolus depuis plus de 10 minutes', active: true },

  // === PLATFORM (SuperAdmin) ===
  { trigger: 'platform_new_commercant', label: 'Nouveau commerçant inscrit', tenantType: 'platform', channels: '["bell"]', recipient: 'supervisor', template: 'Nouveau commerçant: {NAME} ({TYPE}). Ville: {CITY}', description: 'Un nouveau commerçant s\'est inscrit sur la plateforme', active: true },
  { trigger: 'platform_commercant_suspended', label: 'Commerçant suspendu', tenantType: 'platform', channels: '["bell"]', recipient: 'supervisor', template: 'Commerçant suspendu: {NAME}. Raison: {REASON}', description: 'Un commerçant a été suspendu', active: true },
  { trigger: 'platform_new_order', label: 'Nouvelle commande QR', tenantType: 'platform', channels: '["bell"]', recipient: 'supervisor', template: 'Nouvelle commande: {PRODUCT} x{QTY}. Montant: {AMOUNT} FCFA', description: 'Une nouvelle commande de support QR a été passée', active: true },
  { trigger: 'platform_critical', label: 'Alerte système critique', tenantType: 'platform', channels: '["email","sms_mtarget"]', recipient: 'supervisor', template: 'CRITIQUE: {SERVICE} est {STATUS}. Détecté à {TIME}.', description: 'Une alerte critique du système a été détectée', active: true },
]

async function main() {
  console.log(`Seeding ${TEMPLATES.length} notification templates...`)

  for (const t of TEMPLATES) {
    await db.notificationTemplate.upsert({
      where: { trigger: t.trigger },
      create: t,
      update: {
        label: t.label,
        tenantType: t.tenantType,
        channels: t.channels,
        recipient: t.recipient,
        template: t.template,
        description: t.description,
      },
    })
    console.log(`  ✓ ${t.tenantType.padEnd(10)} | ${t.trigger}`)
  }

  console.log(`\nDone! ${TEMPLATES.length} templates seeded.`)
  const byTenant: Record<string, number> = {}
  for (const t of TEMPLATES) byTenant[t.tenantType] = (byTenant[t.tenantType] || 0) + 1
  for (const [k, v] of Object.entries(byTenant)) {
    console.log(`  ${k}: ${v} notifications`)
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
