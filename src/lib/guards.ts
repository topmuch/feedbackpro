// ============================================================
// FeedbackPro - Guards d'authentification pour les API routes
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, fail } from "@/lib/session"
import { Pro } from "@prisma/client"

export type ProContext = {
  user: { id: string; email: string; role: string }
  pro: Pro & { boutiques: { id: string }[] }
  boutique: { id: string }
}

/** Vérifie que la requête provient d'un commerçant connecté */
export async function requirePro(req: NextRequest): Promise<ProContext | null> {
  const user = await getSessionUser(req)
  if (!user || user.role !== "PRO" || !user.proId) return null

  const pro = await db.pro.findUnique({
    where: { id: user.proId },
    include: { boutiques: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  })
  if (!pro || pro.boutiques.length === 0) return null

  return {
    user: { id: user.id, email: user.email, role: user.role },
    pro,
    boutique: pro.boutiques[0],
  }
}

/** Vérifie que la requête provient du superadmin */
export async function requireAdmin(req: NextRequest): Promise<{ id: string; email: string } | null> {
  const user = await getSessionUser(req)
  if (!user || user.role !== "SUPERADMIN") return null
  return { id: user.id, email: user.email }
}

export const unauthorized = () => fail("Non autorisé", 401)
