// ============================================================
// GET /api/routing/overview
// ------------------------------------------------------------
// Agrégat unique pour les interfaces du moteur de routage :
//   - SuperAdmin « Matrice de Routage » (admin-routing-tab)
//   - Manager « Vue Orchestration » (vip-orchestration-tab)
//
// Renvoie : règles, staff + compétences + stats live, historique
// récent, statistiques 7 jours, tâches proactives, alertes.
// Seed idempotent au premier appel (règles métier + comptes démo).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { assurerSeedRoutage, statistiquesRoutage } from '@/lib/routing-engine'
import { parseJsonArray } from '@/lib/routing-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return fail('Non authentifié', 401)

    const tenantKey = req.nextUrl.searchParams.get('tenant') ?? 'vip_lounge'
    await assurerSeedRoutage(tenantKey)

    const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const debutJour = new Date()
    debutJour.setHours(0, 0, 0, 0)

    const [regles, competences, historique, proactives, ouvertsParStaff, duJour, fermes] = await Promise.all([
      db.routingRule.findMany({ where: { tenantKey }, orderBy: [{ rulePriority: 'desc' }, { createdAt: 'asc' }] }),
      db.staffCompetency.findMany({
        where: { tenantKey },
        include: { staff: { select: { id: true, name: true, phone: true, role: true, avatarUrl: true, active: true, lastLoginAt: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.routingHistory.findMany({
        where: { tenantKey, createdAt: { gte: depuis } },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
      db.proactiveTask.findMany({ where: { tenantKey }, orderBy: { createdAt: 'asc' } }),
      db.routingHistory.groupBy({ by: ['staffId'], where: { tenantKey, open: true }, _count: { _all: true } }),
      db.routingHistory.groupBy({ by: ['staffId'], where: { tenantKey, createdAt: { gte: debutJour } }, _count: { _all: true } }),
      db.routingHistory.findMany({
        where: { tenantKey, open: false, createdAt: { gte: depuis }, staffId: { not: null } },
        select: { staffId: true, outcome: true, resolutionTimeSec: true },
      }),
    ])

    // Stats live par staff
    const actifs = new Map<string, number>()
    for (const g of ouvertsParStaff) if (g.staffId) actifs.set(g.staffId, g._count._all)
    const aujourdhui = new Map<string, number>()
    for (const g of duJour) if (g.staffId) aujourdhui.set(g.staffId, g._count._all)

    const perf = new Map<string, { total: number; resolus: number; sommes: number; nb: number }>()
    for (const h of fermes) {
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

    const staff = competences.map((c) => {
      const p = perf.get(c.staffId)
      return {
        id: c.staffId,
        name: c.staff.name,
        phone: c.staff.phone,
        role: c.staff.role,
        avatarUrl: c.staff.avatarUrl,
        active: c.staff.active,
        lastLoginAt: c.staff.lastLoginAt?.toISOString() ?? null,
        competencyId: c.id,
        tenantKey: c.tenantKey,
        category: c.category,
        zones: parseJsonArray<string>(c.zones),
        signalTypes: parseJsonArray<string>(c.signalTypes),
        isOnDuty: c.isOnDuty,
        shiftStart: c.shiftStart,
        shiftEnd: c.shiftEnd,
        shiftDays: parseJsonArray<number>(c.shiftDays, [0, 1, 2, 3, 4, 5, 6]),
        maxActiveTasks: c.maxActiveTasks,
        currentZone: c.currentZone,
        deniseEnabled: c.deniseEnabled,
        deniseTone: c.deniseTone,
        // stats live
        activeTasks: actifs.get(c.staffId) ?? 0,
        todayCount: aujourdhui.get(c.staffId) ?? 0,
        successRate: p && p.total > 0 ? Math.round((p.resolus / p.total) * 100) : null,
        avgResolutionMin: p && p.nb > 0 ? Math.round(p.sommes / p.nb / 60) : null,
        closedTotal: p?.total ?? 0,
      }
    })

    // Alertes orchestration : surcharge + non pris en charge > 5 min
    const maintenant = Date.now()
    const alertes: { type: string; message: string; severity: 'warning' | 'danger' }[] = []
    for (const s of staff) {
      if (s.activeTasks >= s.maxActiveTasks) {
        alertes.push({
          type: 'surcharge',
          message: `${s.name} en surcharge (${s.activeTasks}/${s.maxActiveTasks}) — nouveaux incidents routés ailleurs.`,
          severity: 'warning',
        })
      }
    }
    for (const h of historique) {
      if (h.open && h.outcome === 'assigned' && !h.escalated) {
        const minutes = Math.round((maintenant - h.createdAt.getTime()) / 60000)
        if (minutes >= 5) {
          alertes.push({
            type: 'no_accept',
            message: `${h.staffName ?? '—'} n'a pas pris l'incident « ${h.incidentLabel ?? '—'} » depuis ${minutes} min.`,
            severity: 'danger',
          })
        }
      }
      if (h.escalated && h.open) {
        alertes.push({
          type: 'escalade',
          message: `Escalade : « ${h.incidentLabel ?? 'Incident'} » non pris en charge par ${h.staffName ?? '—'}.`,
          severity: 'danger',
        })
      }
    }

    const stats = await statistiquesRoutage(tenantKey, 7)

    return ok({
      tenantKey,
      rules: regles,
      staff,
      history: historique.map((h) => ({
        id: h.id,
        incidentKind: h.incidentKind,
        incidentId: h.incidentId,
        incidentLabel: h.incidentLabel,
        zoneCode: h.zoneCode,
        signalType: h.signalType,
        priority: h.priority,
        staffId: h.staffId,
        staffName: h.staffName,
        ruleId: h.ruleId,
        score: h.score,
        breakdown: parseJsonArray<{ label: string; points: number }>(h.scoreBreakdown),
        decisionMs: h.decisionMs,
        escalated: h.escalated,
        open: h.open,
        outcome: h.outcome,
        responseTimeSec: h.responseTimeSec,
        resolutionTimeSec: h.resolutionTimeSec,
        createdAt: h.createdAt.toISOString(),
      })),
      proactive: proactives.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        targetZone: t.targetZone,
        targetCategory: t.targetCategory,
        targetStaffId: t.targetStaffId,
        recurrence: t.recurrence,
        intervalMinutes: t.intervalMinutes,
        scheduledTimes: parseJsonArray<string>(t.scheduledTimes),
        checklistItems: parseJsonArray<{ item: string; required: boolean }>(t.checklistItems),
        notifyVia: parseJsonArray<string>(t.notifyVia),
        deniseMessage: t.deniseMessage,
        lastRunAt: t.lastRunAt?.toISOString() ?? null,
        nextRunAt: t.nextRunAt?.toISOString() ?? null,
        active: t.active,
      })),
      alertes: alertes.slice(0, 12),
      stats,
    })
  } catch (err) {
    console.warn('[routing-overview] error:', err instanceof Error ? err.message : String(err))
    return fail('Erreur serveur', 500)
  }
}
