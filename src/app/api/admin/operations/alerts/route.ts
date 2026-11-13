// ============================================================
// Task O1 — Centre Opérationnel : flux d'alertes récentes
// ------------------------------------------------------------
// GET /api/admin/operations/alerts
//   → renvoie les 50 dernières alertes (status != "ok")
//   → triées par detectedAt DESC
//   → inclut resolvedAt (null = toujours actif)
//
// Utilisé par le "Live Alert Feed" du Centre Opérationnel qui
// rafraîchit toutes les 5 secondes.
//
// Réponse :
//   { ok: true, data: { alerts: SystemHealthLogAlert[], total: number } }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"

export type SystemHealthLogAlert = {
  id: string
  serviceName: string
  status: string
  latencyMs: number | null
  errorMessage: string | null
  detectedAt: string
  resolvedAt: string | null
  alertSent: boolean
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    // 50 dernières alertes (warning + critical), les plus récentes d'abord
    const rows = await db.systemHealthLog.findMany({
      where: {
        status: { in: ["warning", "critical"] },
      },
      orderBy: { detectedAt: "desc" },
      take: 50,
      select: {
        id: true,
        serviceName: true,
        status: true,
        latencyMs: true,
        errorMessage: true,
        detectedAt: true,
        resolvedAt: true,
        alertSent: true,
      },
    })

    const alerts: SystemHealthLogAlert[] = rows.map((r) => ({
      id: r.id,
      serviceName: r.serviceName,
      status: r.status,
      latencyMs: r.latencyMs,
      errorMessage: r.errorMessage,
      detectedAt: r.detectedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      alertSent: r.alertSent,
    }))

    return ok({
      alerts,
      total: alerts.length,
    })
  } catch (e) {
    console.error("admin operations alerts error", e)
    return fail("Erreur serveur", 500)
  }
}
