// ============================================================
// API - Utilisateur courant
// GET /api/auth/me → { user: { id, email, role }, pro: ProData | null }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, ok, fail, serializePro, type ProData } from "@/lib/session"

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return ok(null)

    let pro: ProData | null = null
    if (user.proId) {
      const p = await db.pro.findUnique({ where: { id: user.proId } })
      if (p) pro = serializePro(p)
    }

    return ok({ user: { id: user.id, email: user.email, role: user.role }, pro })
  } catch (e) {
    console.error("me error", e)
    return fail("Erreur serveur", 500)
  }
}
