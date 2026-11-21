// ============================================================
// /api/routing/staff — Employés + compétences de routage
// ------------------------------------------------------------
// GET    : liste staff + compétence + stats live (session requise —
//          utilisée par SuperAdmin et par la Vue Orchestration manager)
// POST   : création d'un employé (superadmin) — StaffAccount
//          (tél + PIN) + StaffCompetency en une transaction
// PATCH  : ?id=… mise à jour (superadmin) — champs + compétence
// DELETE : ?id=… désactivation (superadmin) — soft delete
// ============================================================

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { requireAdmin, unauthorized } from '@/lib/guards'
import { parseJsonArray } from '@/lib/routing-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex')
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)
  const tenantKey = req.nextUrl.searchParams.get('tenant') ?? 'vip_lounge'

  const competences = await db.staffCompetency.findMany({
    where: { tenantKey },
    include: { staff: { select: { id: true, name: true, phone: true, role: true, avatarUrl: true, active: true, lastLoginAt: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const debutJour = new Date()
  debutJour.setHours(0, 0, 0, 0)

  const [ouverts, duJour, fermes] = await Promise.all([
    db.routingHistory.groupBy({ by: ['staffId'], where: { tenantKey, open: true }, _count: { _all: true } }),
    db.routingHistory.groupBy({ by: ['staffId'], where: { tenantKey, createdAt: { gte: debutJour } }, _count: { _all: true } }),
    db.routingHistory.findMany({
      where: { tenantKey, open: false, createdAt: { gte: depuis }, staffId: { not: null } },
      select: { staffId: true, outcome: true, resolutionTimeSec: true },
    }),
  ])

  const actifs = new Map<string, number>()
  for (const g of ouverts) if (g.staffId) actifs.set(g.staffId, g._count._all)
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

  return ok(
    competences.map((c) => {
      const p = perf.get(c.staffId)
      return {
        id: c.staffId,
        competencyId: c.id,
        name: c.staff.name,
        phone: c.staff.phone,
        role: c.staff.role,
        avatarUrl: c.staff.avatarUrl,
        active: c.staff.active,
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
        activeTasks: actifs.get(c.staffId) ?? 0,
        todayCount: aujourdhui.get(c.staffId) ?? 0,
        successRate: p && p.total > 0 ? Math.round((p.resolus / p.total) * 100) : null,
        avgResolutionMin: p && p.nb > 0 ? Math.round(p.sommes / p.nb / 60) : null,
        closedTotal: p?.total ?? 0,
      }
    }),
  )
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return fail('Nom requis', 400)
  }
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (!/^\+?\d{8,15}$/.test(phone.replace(/\s/g, ''))) {
    return fail('Téléphone invalide (ex: +221771234567)', 400)
  }
  const pin = typeof body.pin === 'string' && /^\d{4,6}$/.test(body.pin) ? body.pin : '1234'

  const categorie = typeof body.category === 'string' && body.category ? body.category : 'serveur'
  const existing = await db.staffAccount.findUnique({ where: { phone: phone.replace(/\s/g, '') } })
  if (existing) return fail('Ce numéro de téléphone est déjà enregistré', 409)

  try {
    const staff = await db.staffAccount.create({
      data: {
        name: body.name.trim().slice(0, 80),
        phone: phone.replace(/\s/g, ''),
        pinHash: hashPin(pin),
        role: typeof body.role === 'string' && body.role ? body.role : categorie,
        avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : null,
        active: true,
      },
    })
    const competency = await db.staffCompetency.create({
      data: {
        staffId: staff.id,
        tenantKey: typeof body.tenantKey === 'string' ? body.tenantKey : 'vip_lounge',
        category: categorie,
        zones: JSON.stringify(Array.isArray(body.zones) ? body.zones : []),
        signalTypes: JSON.stringify(Array.isArray(body.signalTypes) ? body.signalTypes : []),
        isOnDuty: body.isOnDuty !== false,
        shiftStart: typeof body.shiftStart === 'string' && body.shiftStart ? body.shiftStart : null,
        shiftEnd: typeof body.shiftEnd === 'string' && body.shiftEnd ? body.shiftEnd : null,
        shiftDays: JSON.stringify(Array.isArray(body.shiftDays) && body.shiftDays.length > 0 ? body.shiftDays : [1, 2, 3, 4, 5]),
        maxActiveTasks: Number.isFinite(Number(body.maxActiveTasks)) ? Math.max(1, Math.min(20, Math.round(Number(body.maxActiveTasks)))) : 3,
        deniseEnabled: body.deniseEnabled !== false,
        deniseTone: ['soft', 'normal', 'urgent'].includes(body.deniseTone) ? body.deniseTone : 'normal',
      },
    })
    return ok({ staff: { id: staff.id, name: staff.name, phone: staff.phone }, competency })
  } catch (err) {
    console.warn('[routing-staff] create error:', err instanceof Error ? err.message : String(err))
    return fail('Création impossible (numéro déjà pris ?)', 400)
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string') return fail('Paramètre id manquant', 400)

  const competencyData: Record<string, unknown> = {}
  if (Array.isArray(body.zones)) competencyData.zones = JSON.stringify(body.zones)
  if (Array.isArray(body.signalTypes)) competencyData.signalTypes = JSON.stringify(body.signalTypes)
  if (typeof body.category === 'string' && body.category) competencyData.category = body.category
  if (typeof body.isOnDuty === 'boolean') competencyData.isOnDuty = body.isOnDuty
  if (body.shiftStart !== undefined) competencyData.shiftStart = body.shiftStart || null
  if (body.shiftEnd !== undefined) competencyData.shiftEnd = body.shiftEnd || null
  if (Array.isArray(body.shiftDays)) competencyData.shiftDays = JSON.stringify(body.shiftDays)
  if (Number.isFinite(Number(body.maxActiveTasks))) competencyData.maxActiveTasks = Math.max(1, Math.min(20, Math.round(Number(body.maxActiveTasks))))
  if (body.currentZone !== undefined) competencyData.currentZone = body.currentZone || null
  if (typeof body.deniseEnabled === 'boolean') competencyData.deniseEnabled = body.deniseEnabled
  if (['soft', 'normal', 'urgent'].includes(body.deniseTone)) competencyData.deniseTone = body.deniseTone

  const staffData: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) staffData.name = body.name.trim().slice(0, 80)
  if (typeof body.active === 'boolean') staffData.active = body.active
  if (typeof body.pin === 'string' && /^\d{4,6}$/.test(body.pin)) staffData.pinHash = hashPin(body.pin)

  try {
    const staff = Object.keys(staffData).length > 0
      ? await db.staffAccount.update({ where: { id: body.id }, data: staffData })
      : await db.staffAccount.findUnique({ where: { id: body.id } })
    if (!staff) return fail('Employé introuvable', 404)
    const competency = Object.keys(competencyData).length > 0
      ? await db.staffCompetency.upsert({
          where: { staffId: body.id },
          update: competencyData,
          create: { staffId: body.id, tenantKey: 'vip_lounge' },
        })
      : await db.staffCompetency.findUnique({ where: { staffId: body.id } })
    return ok({ staff: { id: staff.id, name: staff.name }, competency })
  } catch {
    return fail('Employé introuvable', 404)
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return fail('Paramètre id manquant', 400)
  try {
    // Soft delete : désactive le compte (l'historique de routage est préservé)
    await db.staffAccount.update({ where: { id }, data: { active: false } })
    await db.staffCompetency.updateMany({ where: { staffId: id }, data: { isOnDuty: false } })
    return ok({ deactivated: id })
  } catch {
    return fail('Employé introuvable', 404)
  }
}
