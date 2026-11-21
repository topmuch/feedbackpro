// ============================================================
// /api/routing/proactive — Tâches proactives (au-delà des signalements)
// ------------------------------------------------------------
// GET    : liste (superadmin)
// POST   : upsert (superadmin)
// DELETE : ?id=… (superadmin)
// Exécution : POST /api/routing/tick (moteur)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { requireAdmin, unauthorized } from '@/lib/guards'
import { parseJsonArray } from '@/lib/routing-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()
  const tenantKey = req.nextUrl.searchParams.get('tenant') ?? 'vip_lounge'
  const tasks = await db.proactiveTask.findMany({
    where: { tenantKey },
    orderBy: { createdAt: 'asc' },
  })
  return ok({
    tasks: tasks.map((t) => ({
      ...t,
      scheduledTimes: parseJsonArray<string>(t.scheduledTimes),
      checklistItems: parseJsonArray<{ item: string; required: boolean }>(t.checklistItems),
      notifyVia: parseJsonArray<string>(t.notifyVia),
    })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body.title !== 'string' || !body.title.trim()) {
    return fail('Titre requis', 400)
  }

  const data = {
    tenantKey: typeof body.tenantKey === 'string' ? body.tenantKey : 'vip_lounge',
    title: body.title.trim().slice(0, 200),
    description: typeof body.description === 'string' ? body.description : null,
    targetZone: body.targetZone || null,
    targetCategory: body.targetCategory || null,
    targetStaffId: body.targetStaffId || null,
    recurrence: ['once', 'daily', 'weekly', 'interval'].includes(body.recurrence) ? body.recurrence : 'interval',
    intervalMinutes: Number.isFinite(Number(body.intervalMinutes)) && Number(body.intervalMinutes) > 0 ? Math.round(Number(body.intervalMinutes)) : 30,
    scheduledTimes: JSON.stringify(Array.isArray(body.scheduledTimes) ? body.scheduledTimes : []),
    checklistItems: JSON.stringify(
      Array.isArray(body.checklistItems)
        ? body.checklistItems.filter((c: { item?: string }) => c && typeof c.item === 'string' && c.item.trim()).map((c: { item: string; required?: boolean }) => ({ item: c.item.trim(), required: c.required !== false }))
        : [],
    ),
    notifyVia: JSON.stringify(Array.isArray(body.notifyVia) ? body.notifyVia : ['denise']),
    deniseMessage: typeof body.deniseMessage === 'string' && body.deniseMessage ? body.deniseMessage : null,
    active: body.active !== false,
    // (ré)activation → première exécution dans 2 minutes
    nextRunAt: new Date(Date.now() + 2 * 60 * 1000),
  }

  try {
    const task = body.id
      ? await db.proactiveTask.update({ where: { id: body.id }, data })
      : await db.proactiveTask.create({ data })
    return ok({ task })
  } catch {
    return fail('Tâche introuvable ou invalide', 400)
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return fail('Paramètre id manquant', 400)
  try {
    await db.proactiveTask.delete({ where: { id } })
    return ok({ deleted: id })
  } catch {
    return fail('Tâche introuvable', 404)
  }
}
