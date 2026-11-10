// ============================================================
// API Pro - Liste complète des rapports IA (Session 4, §3)
// GET /api/pro/coach/rapports → { rapports: RapportSerialise[] }
// Renvoie les rapports quotidiens ET hebdomadaires AVEC leur contenu
// markdown (contrairement à l'historique léger de /api/pro/coach) —
// nécessaire pour l'affichage complet dans le modal de /dashboard/rapports.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRapport } from "@/lib/ia"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const limite = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limite") || 50)))

    const rapports = await db.rapportIA.findMany({
      where: { proId: ctx.pro.id },
      orderBy: { createdAt: "desc" },
      take: limite,
    })

    return ok({ rapports: rapports.map(serialiserRapport) })
  } catch (e) {
    console.error("coach/rapports GET error", e)
    return fail("Erreur serveur", 500)
  }
}
