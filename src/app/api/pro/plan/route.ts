// ============================================================
// API Pro - Changement de plan (Stripe simulé)
// POST /api/pro/plan { plan: "STARTER" | "PRO" | "ENTERPRISE" } → { pro }
// Plans Session 1 : Starter 29 € · Pro 99 € · Enterprise 249 €
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, serializePro } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { planSchema, firstError } from "@/lib/validation"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = planSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { plan } = parsed.data

    // === Checkout Stripe simulé (sandbox sans clés API) ===
    console.log(`[STRIPE SIMULÉ] ${ctx.pro.nomEtablissement} change de plan → ${plan}`)

    const updated = await db.pro.update({
      where: { id: ctx.pro.id },
      data: { plan },
    })

    return ok({ pro: serializePro(updated) })
  } catch (e) {
    console.error("plan error", e)
    return fail("Erreur serveur", 500)
  }
}
