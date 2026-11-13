// ============================================================
// API Superadmin — Notification Logs (historique des envois)
// ------------------------------------------------------------
// GET /api/admin/notifications/logs?limit=100&offset=0&canal=&status=
//   → renvoie les derniers NotificationLog (par défaut 100)
//   → filtres optionnels : canal (sms_mtarget, push_pwa, …) + status (sent, failed, …)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { requireAdmin, unauthorized } from '@/lib/guards'

export const runtime = 'nodejs'

const MAX_LIMIT = 500

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return unauthorized()

  const url = new URL(req.url)
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const canal = url.searchParams.get('canal') || undefined
  const status = url.searchParams.get('status') || undefined

  const limit = Math.min(Number.isFinite(limitRaw) ? Math.max(1, limitRaw) : 100, MAX_LIMIT)
  const offset = Math.min(Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0, Number.MAX_SAFE_INTEGER)

  const where: { canal?: string; status?: string } = {}
  if (canal) where.canal = canal
  if (status) where.status = status

  const [logs, total] = await Promise.all([
    db.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.notificationLog.count({ where }),
  ])

  const data = logs.map((l) => ({
    id: l.id,
    trigger: l.trigger,
    canal: l.canal,
    recipient: l.recipient,
    status: l.status,
    message: l.message,
    cost: l.cost,
    reportId: l.reportId,
    createdAt: l.createdAt,
  }))

  return ok({ logs: data, total, limit, offset })
}
