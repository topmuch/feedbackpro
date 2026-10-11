// ============================================================
// API Pro - Alertes temps réel
// GET   /api/pro/alertes
// PATCH /api/pro/alertes { id? , all?: true }  → marquer lu
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const alertes = await db.alerte.findMany({
      where: { proId: ctx.pro.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    const nonLues = alertes.filter((a) => !a.lu).length
    return ok({ alertes, nonLues })
  } catch (e) {
    console.error("alertes GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json().catch(() => ({}))
    if (body.all === true) {
      await db.alerte.updateMany({ where: { proId: ctx.pro.id, lu: false }, data: { lu: true } })
      return ok({ done: true })
    }
    const id = String(body.id || "")
    if (!id) return fail("ID manquant", 400)
    await db.alerte.updateMany({ where: { id, proId: ctx.pro.id }, data: { lu: true } })
    return ok({ done: true })
  } catch (e) {
    console.error("alertes PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
