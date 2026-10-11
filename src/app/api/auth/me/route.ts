// ============================================================
// API - Utilisateur courant
// GET /api/auth/me
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, ok, fail } from "@/lib/session"
import type { Pro } from "@prisma/client"

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return ok(null)

    let pro: Pro | null = null
    if (user.proId) {
      pro = await db.pro.findUnique({ where: { id: user.proId } })
    }

    return ok({ user: { id: user.id, email: user.email, role: user.role }, pro })
  } catch (e) {
    console.error("me error", e)
    return fail("Erreur serveur", 500)
  }
}
