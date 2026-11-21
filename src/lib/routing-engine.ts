// ============================================================
// MOTEUR DE ROUTAGE INTELLIGENT — Le Cœur
// ------------------------------------------------------------
// "Quand un signalement arrive, le système sait instantanément QUI
// doit le traiter, OÙ il est, et POURQUOI c'est lui — sans
// intervention humaine."
//
// Pipeline (< 500 ms cible) :
//   1. Trouver toutes les règles qui matchent (zone × type × priorité)
//   2. Prendre la règle la plus spécifique (spécificité > rulePriority)
//   3. Trouver les candidats disponibles (catégorie, service, shift,
//      capacité max — anti-surcharge)
//   4. Scorer le MEILLEUR candidat (compétence, zone, charge,
//      performance, rotation équitable)
//   5. Assigner + notifier (Denise) + journaliser (RoutingHistory)
//
// Fallbacks : catégorie fallback → manager → escalade.
// Toutes les fonctions sont best-effort : elles ne lèvent JAMAIS
// (les flux signalements existants doivent rester robustes).
// ============================================================

import { db } from '@/lib/db'
import type { RoutingRule } from '@prisma/client'
import {
  ROUTING_SIGNAL_TYPES,
  VIP_ROUTING_ZONES,
  VIP_SEED_RULES,
  VIP_SEED_PROACTIVE,
  SIGNAL_LABEL,
  ZONE_LABEL,
  CATEGORIE_LABEL,
  estDansShift,
  normaliserZone,
  normaliserSignalType,
  parseJsonArray,
  prioriteHeuristique,
} from '@/lib/routing-config'

const TENANT_DEFAUT = 'vip_lounge'

// ------------------------------------------------------------
// Types publics
// ------------------------------------------------------------
export type IncidentEntrant = {
  tenantKey?: string
  incidentKind: 'airport_report' | 'vip_request' | 'proactive'
  incidentId?: string
  incidentLabel?: string
  zone?: string | null
  signalType?: string | null
  priority?: 'low' | 'medium' | 'high' | 'critical' | null
  /** true = simulation (aucune écriture BDD, aucune notification) */
  dryRun?: boolean
}

export type LigneScore = { label: string; points: number }

export type DecisionRoutage = {
  ok: boolean
  reason: 'assigned' | 'escalated' | 'no_rule' | 'no_candidate' | 'disabled' | 'error'
  message?: string
  staff?: { id: string; name: string; category: string } | null
  rule?: { id: string; zoneCode: string | null; signalType: string | null; priority: string } | null
  score?: number
  breakdown?: LigneScore[]
  decisionMs?: number
  historyId?: string
  denise?: { announce: boolean; tone: string; forStaff: string | null; forManager: string | null; forPublic: string | null } | null
}

type Candidat = {
  staffId: string
  staffName: string
  category: string
  zones: string[]
  signalTypes: string[]
  currentZone: string | null
  maxActiveTasks: number
  activeTasks: number
  todayCount: number
  successRate: number // 0..1
  avgResolutionSec: number | null
  deniseEnabled: boolean
  deniseTone: string
  competencyId: string
}

// ------------------------------------------------------------
// SEED IDEMPOTENT — règles + compétences + tâches proactives
// Appelé par /api/routing/overview (jamais par le flux public).
// ------------------------------------------------------------
const ROLE_VERS_CATEGORIE: Record<string, string> = {
  manager: 'manager',
  maitre_dhotel: 'maitre_dhotel',
  reception: 'reception',
  etage: 'nettoyage',
  barman: 'barman',
  serveur: 'serveur',
  nettoyage: 'nettoyage',
  maintenance: 'maintenance',
  securite: 'securite',
}

const ZONES_PAR_CATEGORIE: Record<string, string[]> = {
  manager: VIP_ROUTING_ZONES.map((z) => z.code),
  maitre_dhotel: VIP_ROUTING_ZONES.map((z) => z.code),
  serveur: ['com_lounge', 'vip_relaxation'],
  barman: ['vip_buffet'],
  nettoyage: ['com_lounge', 'vip_relaxation', 'vip_buffet', 'vip_showers', 'vip_meeting'],
  maintenance: VIP_ROUTING_ZONES.map((z) => z.code),
  securite: VIP_ROUTING_ZONES.map((z) => z.code),
  reception: ['vip_reception', 'com_lounge'],
}

const TYPES_PAR_CATEGORIE: Record<string, string[]> = {
  manager: ['vip', 'bruit'],
  maitre_dhotel: ['vip', 'bruit', 'service_lent', 'autre'],
  serveur: ['commande', 'service_lent', 'nourriture', 'confort'],
  barman: ['commande', 'nourriture', 'service_lent'],
  nettoyage: ['proprete', 'confort'],
  maintenance: ['equipement', 'temperature', 'confort'],
  securite: ['vip', 'bruit'],
  reception: ['attente', 'conciergerie', 'commande'],
}

// Comptes de démonstration pour couvrir les catégories sans staff
const STAFF_DEMO_MANQUANTS: Record<string, { name: string; phone: string; role: string }> = {
  serveur: { name: 'Cheikh Gueye', phone: '+221770000007', role: 'serveur' },
  maintenance: { name: 'Serigne Mbaye', phone: '+221770000008', role: 'maintenance' },
  securite: { name: 'Ousmane Ka', phone: '+221770000009', role: 'securite' },
}

function hashPinDemo(pin: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto')
  return crypto.createHash('sha256').update(pin).digest('hex')
}

export async function assurerSeedRoutage(tenantKey: string = TENANT_DEFAUT): Promise<void> {
  try {
    // 1. Règles métier
    const nbRegles = await db.routingRule.count({ where: { tenantKey } })
    if (nbRegles === 0) {
      await db.routingRule.createMany({
        data: VIP_SEED_RULES.map((r) => ({
          tenantKey,
          zoneCode: r.zoneCode,
          signalType: r.signalType,
          priority: r.priority,
          targetCategory: r.targetCategory,
          fallbackCategory: r.fallbackCategory ?? null,
          escalationAfterMin: r.escalationAfterMin,
          escalationTarget: 'manager',
          deniseAnnounce: true,
          deniseTone: r.deniseTone ?? 'normal',
          rulePriority: r.rulePriority,
          active: true,
        })),
      })
    }

    // 2. Compétences pour tous les StaffAccount existants
    const staffSansCompetence = await db.staffAccount.findMany({
      where: { competency: { is: null } },
    })
    for (const s of staffSansCompetence) {
      const categorie = ROLE_VERS_CATEGORIE[s.role] ?? 'serveur'
      await db.staffCompetency.create({
        data: {
          staffId: s.id,
          tenantKey,
          category: categorie,
          zones: JSON.stringify(ZONES_PAR_CATEGORIE[categorie] ?? []),
          signalTypes: JSON.stringify(TYPES_PAR_CATEGORIE[categorie] ?? []),
          isOnDuty: true, // mode démo : tout le monde en service par défaut
          maxActiveTasks: 3,
          deniseEnabled: true,
          deniseTone: 'normal',
        },
      })
    }

    // 3. Couverture minimale : catégories sans aucun staff → comptes démo
    const competences = await db.staffCompetency.findMany({
      where: { tenantKey },
      select: { category: true },
    })
    const categoriesCouvertes = new Set(competences.map((c) => c.category))
    for (const [categorie, demo] of Object.entries(STAFF_DEMO_MANQUANTS)) {
      if (categoriesCouvertes.has(categorie)) continue
      const existe = await db.staffAccount.findUnique({ where: { phone: demo.phone } })
      const account =
        existe ??
        (await db.staffAccount.create({
          data: {
            name: demo.name,
            phone: demo.phone,
            pinHash: hashPinDemo('1234'),
            role: demo.role,
            active: true,
          },
        }))
      await db.staffCompetency.upsert({
        where: { staffId: account.id },
        update: { tenantKey, category: categorie },
        create: {
          staffId: account.id,
          tenantKey,
          category: categorie,
          zones: JSON.stringify(ZONES_PAR_CATEGORIE[categorie] ?? []),
          signalTypes: JSON.stringify(TYPES_PAR_CATEGORIE[categorie] ?? []),
          isOnDuty: true,
          maxActiveTasks: 3,
          deniseEnabled: true,
          deniseTone: 'normal',
        },
      })
    }

    // 4. Tâches proactives de départ
    const nbProactif = await db.proactiveTask.count({ where: { tenantKey } })
    if (nbProactif === 0) {
      await db.proactiveTask.createMany({
        data: VIP_SEED_PROACTIVE.map((t) => ({
          tenantKey,
          title: t.title,
          description: t.description,
          targetZone: t.targetZone,
          targetCategory: t.targetCategory,
          recurrence: t.recurrence,
          intervalMinutes: t.intervalMinutes,
          checklistItems: t.checklistItems,
          notifyVia: t.notifyVia,
          deniseMessage: t.deniseMessage,
          active: true,
          // première exécution 2 minutes après le seed
          nextRunAt: new Date(Date.now() + 2 * 60 * 1000),
        })),
      })
    }
  } catch (err) {
    console.warn('[routing-engine] Seed error:', err instanceof Error ? err.message : String(err))
  }
}

// ------------------------------------------------------------
// STATISTIQUES DE CHARGE / PERFORMANCE DES CANDIDATS
// ------------------------------------------------------------
async function chargerStatsCandidats(staffIds: string[]): Promise<{
  actifsParStaff: Map<string, number>
  aujourdhuiParStaff: Map<string, number>
  perfParStaff: Map<string, { successRate: number; avgResolutionSec: number | null }>
}> {
  const actifs = new Map<string, number>()
  const aujourdhui = new Map<string, number>()
  const perf = new Map<string, { successRate: number; avgResolutionSec: number | null }>()
  if (staffIds.length === 0) return { actifsParStaff: actifs, aujourdhuiParStaff: aujourdhui, perfParStaff: perf }

  const debutJour = new Date()
  debutJour.setHours(0, 0, 0, 0)
  const ilYa30j = new Date(Date.now() - 30 * 24 * 3600 * 1000)

  const [ouverts, duJour, fermes] = await Promise.all([
    db.routingHistory.groupBy({
      by: ['staffId'],
      where: { staffId: { in: staffIds }, open: true },
      _count: { _all: true },
    }),
    db.routingHistory.groupBy({
      by: ['staffId'],
      where: { staffId: { in: staffIds }, createdAt: { gte: debutJour } },
      _count: { _all: true },
    }),
    db.routingHistory.findMany({
      where: { staffId: { in: staffIds }, open: false, createdAt: { gte: ilYa30j } },
      select: { staffId: true, outcome: true, resolutionTimeSec: true },
    }),
  ])

  for (const g of ouverts) if (g.staffId) actifs.set(g.staffId, g._count._all)
  for (const g of duJour) if (g.staffId) aujourdhui.set(g.staffId, g._count._all)

  const parStaff = new Map<string, { total: number; resolus: number; sommes: number; nb: number }>()
  for (const h of fermes) {
    if (!h.staffId) continue
    const s = parStaff.get(h.staffId) ?? { total: 0, resolus: 0, sommes: 0, nb: 0 }
    s.total += 1
    if (h.outcome === 'resolved') s.resolus += 1
    if (h.outcome === 'resolved' && h.resolutionTimeSec != null) {
      s.sommes += h.resolutionTimeSec
      s.nb += 1
    }
    parStaff.set(h.staffId, s)
  }
  for (const [staffId, s] of parStaff) {
    perf.set(staffId, {
      successRate: s.total > 0 ? s.resolus / s.total : 0.9, // sans historique : confiance de départ
      avgResolutionSec: s.nb > 0 ? Math.round(s.sommes / s.nb) : null,
    })
  }

  return { actifsParStaff: actifs, aujourdhuiParStaff: aujourdhui, perfParStaff: perf }
}

// ------------------------------------------------------------
// SCORING INTELLIGENT DES CANDIDATS
// Facteurs : compétence (+40), zone (+30/+15), charge (-10/tâche),
// performance (+0..20), rapidité (+0..15), rotation équitable (+5)
// ------------------------------------------------------------
function scorerCandidats(candidats: Candidat[], zone: string | null, type: string | null): { candidat: Candidat; score: number; breakdown: LigneScore[] }[] {
  return candidats.map((s) => {
    const b: LigneScore[] = []
    let score = 0

    // 1. Compétence exacte (+40)
    if (type && s.signalTypes.includes(type)) {
      score += 40
      b.push({ label: `Compétence ${SIGNAL_LABEL(type)}`, points: 40 })
    }

    // 2. Zone actuelle (+30) ou connue (+15)
    if (zone && s.currentZone && s.currentZone === zone) {
      score += 30
      b.push({ label: 'Présent dans la zone', points: 30 })
    } else if (zone && s.zones.includes(zone)) {
      score += 15
      b.push({ label: `Zone attribuée ${ZONE_LABEL(zone)}`, points: 15 })
    }

    // 3. Charge de travail (-10 par tâche active)
    if (s.activeTasks > 0) {
      const malus = -s.activeTasks * 10
      score += malus
      b.push({ label: `Charge ${s.activeTasks}/${s.maxActiveTasks}`, points: malus })
    }

    // 4. Performance historique (+0..20)
    const ptsPerf = Math.round(s.successRate * 20)
    score += ptsPerf
    b.push({ label: `Succès ${Math.round(s.successRate * 100)}%`, points: ptsPerf })

    // 5. Rapidité de résolution (+15 si <5 min, +8 si <10 min)
    if (s.avgResolutionSec != null) {
      if (s.avgResolutionSec < 300) {
        score += 15
        b.push({ label: 'Résolution < 5 min', points: 15 })
      } else if (s.avgResolutionSec < 600) {
        score += 8
        b.push({ label: 'Résolution < 10 min', points: 8 })
      }
    }

    // 6. Bonus rotation équitable (+5 si < 3 tâches aujourd'hui)
    if (s.todayCount < 3) {
      score += 5
      b.push({ label: 'Rotation équitable', points: 5 })
    }

    return { candidat: s, score, breakdown: b }
  })
}

// ------------------------------------------------------------
// CONSTRUCTION DES CANDIDATS DISPONIBLES POUR UNE CATÉGORIE
// ------------------------------------------------------------
async function trouverCandidats(
  tenantKey: string,
  categorie: string,
  staffIdsImposes: string[],
): Promise<Candidat[]> {
  const where = {
    tenantKey,
    ...(categorie !== '*' ? { category: categorie } : {}),
    isOnDuty: true,
    staff: { active: true },
  }
  const competences = await db.staffCompetency.findMany({
    where: staffIdsImposes.length > 0
      ? { staffId: { in: staffIdsImposes }, staff: { active: true }, isOnDuty: true }
      : where,
    include: { staff: { select: { id: true, name: true, active: true } } },
  })

  const eligibles = competences.filter((c) => estDansShift(c.shiftStart, c.shiftEnd, c.shiftDays))
  const staffIds = eligibles.map((c) => c.staffId)
  const stats = await chargerStatsCandidats(staffIds)

  return eligibles
    .map((c) => {
      const perf = stats.perfParStaff.get(c.staffId) ?? { successRate: 0.9, avgResolutionSec: null }
      return {
        staffId: c.staffId,
        staffName: c.staff.name,
        category: c.category,
        zones: parseJsonArray<string>(c.zones),
        signalTypes: parseJsonArray<string>(c.signalTypes),
        currentZone: c.currentZone,
        maxActiveTasks: c.maxActiveTasks,
        activeTasks: stats.actifsParStaff.get(c.staffId) ?? 0,
        todayCount: stats.aujourdhuiParStaff.get(c.staffId) ?? 0,
        successRate: perf.successRate,
        avgResolutionSec: perf.avgResolutionSec,
        deniseEnabled: c.deniseEnabled,
        deniseTone: c.deniseTone,
        competencyId: c.id,
      } satisfies Candidat
    })
    .filter((c) => c.activeTasks < c.maxActiveTasks) // anti-surcharge
}

// ------------------------------------------------------------
// ASSIGNATION + NOTIFICATION + JOURNALISATION
// ------------------------------------------------------------
async function assigner(
  incident: IncidentEntrant & { zone: string | null; type: string | null; priorite: string },
  gagnant: Candidat,
  regle: { id: string | null; deniseAnnounce: boolean; deniseTone: string } | null,
  score: number,
  breakdown: LigneScore[],
  decisionMs: number,
  escalade: boolean,
): Promise<string> {
  const tenantKey = incident.tenantKey ?? TENANT_DEFAUT
  const label = incident.incidentLabel ?? `${SIGNAL_LABEL(incident.type)} — ${ZONE_LABEL(incident.zone)}`

  const history = await db.routingHistory.create({
    data: {
      tenantKey,
      incidentKind: incident.incidentKind,
      incidentId: incident.incidentId ?? null,
      incidentLabel: label,
      zoneCode: incident.zone,
      signalType: incident.type,
      priority: incident.priorite,
      staffId: gagnant.staffId,
      staffName: gagnant.staffName,
      ruleId: regle?.id ?? null,
      matchedConditions: JSON.stringify({
        zone: incident.zone,
        type: incident.type,
        priority: incident.priorite,
        escalade,
      }),
      scoreBreakdown: JSON.stringify(breakdown),
      score,
      decisionMs,
      escalated: escalade,
      open: true,
      outcome: 'assigned',
    },
  })

  // Répercute l'assignation sur l'incident source (compat flux existant)
  if (incident.incidentId) {
    try {
      if (incident.incidentKind === 'airport_report') {
        await db.airportReport.update({ where: { id: incident.incidentId }, data: { assignedTo: gagnant.staffName } })
      } else if (incident.incidentKind === 'vip_request') {
        await db.vipTableRequest.update({ where: { id: incident.incidentId }, data: { staffName: gagnant.staffName } })
      }
    } catch (err) {
      console.warn('[routing-engine] Incident update error:', err instanceof Error ? err.message : String(err))
    }
  }

  return history.id
}

function construireDenise(
  gagnant: Candidat,
  zone: string | null,
  type: string | null,
  regle: { deniseAnnounce: boolean; deniseTone: string } | null,
  escalade: boolean,
): DecisionRoutage['denise'] {
  const announce = escalade || (regle?.deniseAnnounce ?? true)
  const tone = escalade ? 'urgent' : (regle?.deniseTone ?? 'normal')
  const typeLabel = SIGNAL_LABEL(type)
  const zoneLabel = ZONE_LABEL(zone)
  return {
    announce,
    tone,
    forStaff: escalade
      ? `Alerte : tâche non prise en charge. ${gagnant.staffName}, merci de vérifier ${zoneLabel}.`
      : `Nouvel incident ${typeLabel} en zone ${zoneLabel}. ${gagnant.staffName}, c'est pour toi.`,
    forManager: escalade
      ? `Alerte : incident ${typeLabel} escaladé vers ${gagnant.staffName}.`
      : `Incident ${typeLabel} assigné à ${gagnant.staffName}. Charge actuelle : ${gagnant.activeTasks + 1}/${gagnant.maxActiveTasks}.`,
    forPublic: null, // Salon VIP : discrétion — pas d'annonce publique
  }
}

// ------------------------------------------------------------
// FONCTION PRINCIPALE — routerIncident
// ------------------------------------------------------------
export async function routerIncident(incidentEntrant: IncidentEntrant): Promise<DecisionRoutage> {
  const debut = Date.now()
  const tenantKey = incidentEntrant.tenantKey ?? TENANT_DEFAUT
  try {
    const zone = normaliserZone(incidentEntrant.zone)
    const type = normaliserSignalType(incidentEntrant.signalType)
    const priorite = incidentEntrant.priority ?? prioriteHeuristique(type)
    const incident = { ...incidentEntrant, tenantKey, zone, type, priorite }

    // ÉTAPE 1 : règles qui matchent (zone null = toutes, type null = tous)
    const regles = await db.routingRule.findMany({ where: { tenantKey, active: true } })
    const reglesMatch = regles
      .filter((r) => (!r.zoneCode || r.zoneCode === zone) && (!r.signalType || r.signalType === type))
      .sort((a, b) => {
        const specA = (a.zoneCode ? 2 : 0) + (a.signalType ? 1 : 0)
        const specB = (b.zoneCode ? 2 : 0) + (b.signalType ? 1 : 0)
        if (specB !== specA) return specB - specA // spécificité d'abord
        if (b.rulePriority !== a.rulePriority) return b.rulePriority - a.rulePriority
        const ordreP = { critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>
        return (ordreP[b.priority] ?? 0) - (ordreP[a.priority] ?? 0)
      })

    // ÉTAPE 2 : la règle la plus spécifique
    const regle = reglesMatch[0] ?? null

    // Pas de règle → fallback manager
    if (!regle) {
      const managers = await trouverCandidats(tenantKey, 'manager', [])
      if (managers.length > 0) {
        const [meilleur] = scorerCandidats(managers, zone, type).sort((a, b) => b.score - a.score)
        if (incident.dryRun) {
          return {
            ok: true,
            reason: 'assigned',
            message: 'SIMULATION — aucune règle spécifique, routage manager.',
            staff: { id: meilleur.candidat.staffId, name: meilleur.candidat.staffName, category: meilleur.candidat.category },
            score: meilleur.score,
            breakdown: meilleur.breakdown,
            decisionMs: Date.now() - debut,
            denise: construireDenise(meilleur.candidat, zone, type, null, false),
          }
        }
        const historyId = await assigner(incident, meilleur.candidat, null, meilleur.score, meilleur.breakdown, Date.now() - debut, false)
        return {
          ok: true,
          reason: 'assigned',
          message: 'Aucune règle spécifique — routé vers le manager de garde.',
          staff: { id: meilleur.candidat.staffId, name: meilleur.candidat.staffName, category: meilleur.candidat.category },
          score: meilleur.score,
          breakdown: meilleur.breakdown,
          decisionMs: Date.now() - debut,
          historyId,
          denise: construireDenise(meilleur.candidat, zone, type, null, false),
        }
      }
      return {
        ok: false,
        reason: 'no_rule',
        message: 'Aucune règle de routage et aucun manager de garde disponible.',
        decisionMs: Date.now() - debut,
      }
    }

    // ÉTAPE 3 : candidats disponibles (catégorie cible, ou ciblage direct)
    const idsImposes = parseJsonArray<string>(regle.targetStaffIds)
    let candidats = await trouverCandidats(tenantKey, regle.targetCategory, idsImposes)

    // ÉTAPE 4 : scoring → meilleur candidat
    if (candidats.length > 0) {
      const classes = scorerCandidats(candidats, zone, type).sort((a, b) => b.score - a.score)
      const meilleur = classes[0]
      if (incident.dryRun) {
        return {
          ok: true,
          reason: 'assigned',
          message: 'SIMULATION — aucune assignation effectuée.',
          staff: { id: meilleur.candidat.staffId, name: meilleur.candidat.staffName, category: meilleur.candidat.category },
          rule: { id: regle.id, zoneCode: regle.zoneCode, signalType: regle.signalType, priority: regle.priority },
          score: meilleur.score,
          breakdown: meilleur.breakdown,
          decisionMs: Date.now() - debut,
          denise: construireDenise(meilleur.candidat, zone, type, regle, false),
        }
      }
      const historyId = await assigner(incident, meilleur.candidat, regle, meilleur.score, meilleur.breakdown, Date.now() - debut, false)
      return {
        ok: true,
        reason: 'assigned',
        staff: { id: meilleur.candidat.staffId, name: meilleur.candidat.staffName, category: meilleur.candidat.category },
        rule: { id: regle.id, zoneCode: regle.zoneCode, signalType: regle.signalType, priority: regle.priority },
        score: meilleur.score,
        breakdown: meilleur.breakdown,
        decisionMs: Date.now() - debut,
        historyId,
        denise: construireDenise(meilleur.candidat, zone, type, regle, false),
      }
    }

    // ÉTAPE 5 : personne dispo → ESCALADE (fallback category → manager)
    return await escalader(incident, regle, Date.now() - debut)
  } catch (err) {
    console.warn('[routing-engine] routeIncident error:', err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      reason: 'error',
      message: 'Erreur interne du moteur de routage (incident conservé, non assigné).',
      decisionMs: Date.now() - debut,
    }
  }
}

// ------------------------------------------------------------
// ESCALADE INTELLIGENTE
// Niveau 1 : catégorie fallback · Niveau 2 : manager
// (Niveau 3 directeur : balayerEscalades après délai)
// ------------------------------------------------------------
async function escalader(
  incident: IncidentEntrant & { zone: string | null; type: string | null; priorite: string },
  regle: RoutingRule | null,
  decisionMs: number,
): Promise<DecisionRoutage> {
  const tenantKey = incident.tenantKey ?? TENANT_DEFAUT

  // Niveau 1 — catégorie fallback de la règle
  if (regle?.fallbackCategory && regle.fallbackCategory !== regle.targetCategory) {
    const fallback = await trouverCandidats(tenantKey, regle.fallbackCategory, [])
    if (fallback.length > 0) {
      const classes = scorerCandidats(fallback, incident.zone, incident.type).sort((a, b) => b.score - a.score)
      const meilleur = classes[0]
      const historyId = await assigner(incident, meilleur.candidat, regle, meilleur.score, meilleur.breakdown, decisionMs, true)
      return {
        ok: true,
        reason: 'escalated',
        message: `Personne disponible en ${CATEGORIE_LABEL(regle.targetCategory)} — routage de secours vers ${CATEGORIE_LABEL(regle.fallbackCategory)}.`,
        staff: { id: meilleur.candidat.staffId, name: meilleur.candidat.staffName, category: meilleur.candidat.category },
        rule: { id: regle.id, zoneCode: regle.zoneCode, signalType: regle.signalType, priority: regle.priority },
        score: meilleur.score,
        breakdown: meilleur.breakdown,
        decisionMs: Date.now() - decisionMs,
        historyId,
        denise: construireDenise(meilleur.candidat, incident.zone, incident.type, regle, true),
      }
    }
  }

  // Niveau 2 — manager
  const managers = await trouverCandidats(tenantKey, 'manager', [])
  if (managers.length > 0) {
    const classes = scorerCandidats(managers, incident.zone, incident.type).sort((a, b) => b.score - a.score)
    const meilleur = classes[0]
    const historyId = await assigner(incident, meilleur.candidat, regle, meilleur.score, meilleur.breakdown, decisionMs, true)
    return {
      ok: true,
      reason: 'escalated',
      message: `Personne disponible — escalade vers le manager. ${meilleur.candidat.staffName} notifié.`,
      staff: { id: meilleur.candidat.staffId, name: meilleur.candidat.staffName, category: meilleur.candidat.category },
      rule: regle ? { id: regle.id, zoneCode: regle.zoneCode, signalType: regle.signalType, priority: regle.priority } : null,
      score: meilleur.score,
      breakdown: meilleur.breakdown,
      decisionMs: Date.now() - decisionMs,
      historyId,
      denise: {
        announce: true,
        tone: 'urgent',
        forStaff: null,
        forManager: `Alerte ${SIGNAL_LABEL(incident.type)} non assigné. Manager notifié.`,
        forPublic: null,
      },
    }
  }

  // Niveau 3 — personne du tout : incident non assigné (le tableau
  // orchestration affichera l'alerte)
  return {
    ok: false,
    reason: 'no_candidate',
    message: 'Aucun candidat disponible (catégorie cible, fallback et manager saturés ou hors service).',
    rule: regle ? { id: regle.id, zoneCode: regle.zoneCode, signalType: regle.signalType, priority: regle.priority } : null,
    decisionMs,
  }
}

// ------------------------------------------------------------
// CLÔTURE — appelée quand l'incident source change de statut
// (PATCH /api/vip/incidents, PATCH /api/vip/requests, staff-scan)
// ------------------------------------------------------------
export async function cloturerRoutagePourIncident(
  incidentId: string,
  outcome: 'accepted' | 'resolved' | 'failed',
): Promise<void> {
  try {
    const lignes = await db.routingHistory.findMany({
      where: { incidentId, open: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    const ligne = lignes[0]
    if (!ligne) return

    const maintenant = Date.now()
    await db.routingHistory.update({
      where: { id: ligne.id },
      data: {
        open: false,
        outcome,
        responseTimeSec:
          outcome === 'accepted'
            ? Math.round((maintenant - ligne.createdAt.getTime()) / 1000)
            : ligne.responseTimeSec,
        resolutionTimeSec:
          outcome === 'resolved'
            ? Math.round((maintenant - ligne.createdAt.getTime()) / 1000)
            : ligne.resolutionTimeSec,
      },
    })
  } catch (err) {
    console.warn('[routing-engine] cloturerRoutage error:', err instanceof Error ? err.message : String(err))
  }
}

// ------------------------------------------------------------
// BALAYAGE DES ESCALADES — tâches assignées non prises en charge
// après rule.escalationAfterMin → outcome 'escalated' + alerte.
// Retourne la liste des escalades fraîches (file Denise urgent).
// ------------------------------------------------------------
export async function balayerEscalades(tenantKey: string = TENANT_DEFAUT): Promise<
  { historyId: string; staffName: string; label: string; minutes: number }[]
> {
  try {
    const enAttente = await db.routingHistory.findMany({
      where: { tenantKey, open: true, outcome: 'assigned', escalated: false, ruleId: { not: null } },
      include: { rule: { select: { escalationAfterMin: true, escalationTarget: true } } },
      take: 50,
    })
    const maintenant = Date.now()
    const fraiches: { historyId: string; staffName: string; label: string; minutes: number }[] = []

    for (const h of enAttente) {
      const delai = (h.rule?.escalationAfterMin ?? 10) * 60 * 1000
      if (maintenant - h.createdAt.getTime() >= delai) {
        await db.routingHistory.update({
          where: { id: h.id },
          data: { escalated: true, outcome: 'escalated' },
        })
        fraiches.push({
          historyId: h.id,
          staffName: h.staffName ?? '—',
          label: h.incidentLabel ?? 'Incident',
          minutes: Math.round((maintenant - h.createdAt.getTime()) / 60000),
        })
      }
    }
    return fraiches
  } catch (err) {
    console.warn('[routing-engine] balayerEscalades error:', err instanceof Error ? err.message : String(err))
    return []
  }
}

// ------------------------------------------------------------
// TICK PROACTIF — exécute les tâches planifiées arrivées à échéance
// Cas d'usage 3 : "Timer toutes les 30 min → tâche 'Vérification
// buffet' → routage → Denise → checklist → stats"
// ------------------------------------------------------------
export async function executerTickProactif(tenantKey: string = TENANT_DEFAUT): Promise<{
  creees: { taskId: string; title: string; staffName: string | null }[]
}> {
  const creees: { taskId: string; title: string; staffName: string | null }[] = []
  try {
    const maintenant = new Date()
    const dues = await db.proactiveTask.findMany({
      where: { tenantKey, active: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: maintenant } }] },
      take: 10,
    })

    for (const tache of dues) {
      // Assignation : staff imposé, sinon scoring sur la catégorie cible
      let gagnant: Candidat | null = null
      let breakdown: LigneScore[] = []

      if (tache.targetStaffId) {
        const directs = await trouverCandidats(tenantKey, '*', [tache.targetStaffId])
        gagnant = directs[0] ?? null
      }
      if (!gagnant && tache.targetCategory) {
        const candidats = await trouverCandidats(tenantKey, tache.targetCategory, [])
        if (candidats.length > 0) {
          const zone = normaliserZone(tache.targetZone)
          const classes = scorerCandidats(candidats, zone, null).sort((a, b) => b.score - a.score)
          gagnant = classes[0].candidat
          breakdown = classes[0].breakdown
        }
      }
      // Fallback manager
      if (!gagnant) {
        const managers = await trouverCandidats(tenantKey, 'manager', [])
        if (managers.length > 0) {
          const classes = scorerCandidats(managers, null, null).sort((a, b) => b.score - a.score)
          gagnant = classes[0].candidat
          breakdown = classes[0].breakdown
        }
      }

      if (gagnant) {
        const zone = normaliserZone(tache.targetZone)
        await db.routingHistory.create({
          data: {
            tenantKey,
            incidentKind: 'proactive',
            incidentLabel: tache.title,
            zoneCode: zone,
            signalType: null,
            priority: 'medium',
            staffId: gagnant.staffId,
            staffName: gagnant.staffName,
            matchedConditions: JSON.stringify({ proactive: tache.recurrence, category: tache.targetCategory }),
            scoreBreakdown: JSON.stringify(breakdown),
            score: breakdown.reduce((s, b) => s + b.points, 0),
            decisionMs: 0,
            open: true,
            outcome: 'assigned',
          },
        })
        creees.push({ taskId: tache.id, title: tache.title, staffName: gagnant.staffName })
      }

      // Planification suivante
      const prochaine = calculerProchaineExecution(tache.recurrence, tache.intervalMinutes, tache.scheduledTimes)
      await db.proactiveTask.update({
        where: { id: tache.id },
        data: {
          lastRunAt: maintenant,
          nextRunAt: prochaine,
          active: tache.recurrence === 'once' ? false : tache.active,
        },
      })
    }
  } catch (err) {
    console.warn('[routing-engine] tickProactif error:', err instanceof Error ? err.message : String(err))
  }
  return { creees }
}

function calculerProchaineExecution(
  recurrence: string,
  intervalMinutes: number | null,
  scheduledTimesJson: string | null,
): Date | null {
  const maintenant = new Date()
  if (recurrence === 'once') return null
  if (recurrence === 'interval' && intervalMinutes && intervalMinutes > 0) {
    return new Date(maintenant.getTime() + intervalMinutes * 60 * 1000)
  }
  // daily / weekly : prochain créneau de scheduledTimes
  const horaires = parseJsonArray<string>(scheduledTimesJson)
  if (horaires.length > 0) {
    const candidats: Date[] = []
    for (const h of horaires) {
      const [hh, mm] = h.split(':').map(Number)
      for (const jourOffset of [0, 1]) {
        const d = new Date(maintenant)
        d.setDate(d.getDate() + jourOffset + (recurrence === 'weekly' ? 7 : 0))
        d.setHours(hh || 0, mm || 0, 0, 0)
        if (d.getTime() > maintenant.getTime()) candidats.push(d)
      }
    }
    if (candidats.length > 0) return candidats.sort((a, b) => a.getTime() - b.getTime())[0]
  }
  // défaut : +24h
  return new Date(maintenant.getTime() + 24 * 3600 * 1000)
}

// ------------------------------------------------------------
// STATISTIQUES DE ROUTAGE (7 derniers jours)
// ------------------------------------------------------------
export async function statistiquesRoutage(tenantKey: string = TENANT_DEFAUT, jours = 7) {
  try {
    const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000)
    const ilYA1h = new Date(Date.now() - 3600 * 1000)

    const [total, escalades, ouverts, agriDecision, agriResponse, parStaff, parZone, heures] = await Promise.all([
      db.routingHistory.count({ where: { tenantKey, createdAt: { gte: depuis } } }),
      db.routingHistory.count({ where: { tenantKey, createdAt: { gte: depuis }, escalated: true } }),
      db.routingHistory.count({ where: { tenantKey, open: true } }),
      db.routingHistory.aggregate({ where: { tenantKey, createdAt: { gte: depuis } }, _avg: { decisionMs: true } }),
      db.routingHistory.aggregate({
        where: { tenantKey, createdAt: { gte: depuis }, responseTimeSec: { not: null } },
        _avg: { responseTimeSec: true },
      }),
      db.routingHistory.groupBy({
        by: ['staffId'],
        where: { tenantKey, createdAt: { gte: depuis }, staffId: { not: null } },
        _count: { _all: true },
      }),
      db.routingHistory.groupBy({
        by: ['zoneCode'],
        where: { tenantKey, createdAt: { gte: ilYA1h } },
        _count: { _all: true },
      }),
      db.routingHistory.findMany({
        where: { tenantKey, createdAt: { gte: depuis } },
        select: { staffId: true, outcome: true, resolutionTimeSec: true },
      }),
    ])

    // Top routeurs : nom + volume + taux de succès + temps moyen
    const perf = new Map<string, { total: number; resolus: number; sommes: number; nb: number }>()
    for (const h of heures) {
      if (!h.staffId) continue
      const s = perf.get(h.staffId) ?? { total: 0, resolus: 0, sommes: 0, nb: 0 }
      s.total += 1
      if (h.outcome === 'resolved') {
        s.resolus += 1
        if (h.resolutionTimeSec != null) {
          s.sommes += h.resolutionTimeSec
          s.nb += 1
        }
      }
      perf.set(h.staffId, s)
    }
    const staffIds = [...perf.keys()]
    const staffs = staffIds.length > 0
      ? await db.staffAccount.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
      : []
    const nomParId = new Map(staffs.map((s) => [s.id, s.name]))

    const topRouteurs = [...perf.entries()]
      .map(([staffId, s]) => ({
        staffId,
        name: nomParId.get(staffId) ?? '—',
        total: s.total,
        successRate: s.total > 0 ? Math.round((s.resolus / s.total) * 100) : 0,
        avgResolutionMin: s.nb > 0 ? Math.round(s.sommes / s.nb / 60) : null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    return {
      total,
      escalades,
      nonResolus: ouverts,
      tauxAutomatique: total > 0 ? Math.round(((total - escalades) / total) * 100) : 0,
      tauxEscalade: total > 0 ? Math.round((escalades / total) * 100) : 0,
      avgDecisionMs: Math.round(agriDecision._avg.decisionMs ?? 0),
      avgAssignSec: Math.round(agriResponse._avg.responseTimeSec ?? 0),
      topRouteurs,
      heatmap: parZone
        .map((z) => ({ zone: z.zoneCode, label: ZONE_LABEL(z.zoneCode), count: z._count._all }))
        .sort((a, b) => b.count - a.count),
      jours,
    }
  } catch (err) {
    console.warn('[routing-engine] statistiques error:', err instanceof Error ? err.message : String(err))
    return {
      total: 0, escalades: 0, nonResolus: 0, tauxAutomatique: 0, tauxEscalade: 0,
      avgDecisionMs: 0, avgAssignSec: 0, topRouteurs: [], heatmap: [], jours,
    }
  }
}
