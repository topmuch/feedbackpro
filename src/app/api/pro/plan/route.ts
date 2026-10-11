// ============================================================
// API Pro - Changement de plan (Stripe simulé)
// POST /api/pro/plan { plan: "STARTER" | "PRO" | "ENTERPRISE" }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json()
    const plan = String(body.plan || "")
    if (!PLANS[plan as keyof typeof PLANS]) return fail("Plan invalide", 400)

    // === Checkout Stripe simulé (sandbox sans clés API) ===
    console.log(`[STRIPE SIMULÉ] ${ctx.pro.nomCommerce} change de plan → ${plan}`)

    const updated = await db.pro.update({
      where: { id: ctx.pro.id },
      data: { plan },
    })

    return ok({ pro: updated })
  } catch (e) {
    console.error("plan error", e)
    return fail("Erreur serveur", 500)
  }
}
