// ============================================================
// API - Choix du type d'établissement (TENANT-3)
// POST /api/auth/tenant { tenantType }
// ------------------------------------------------------------
// Persistance du tenantType choisi par l'utilisateur à l'étape
// d'onboarding (après login/inscription). Le tenantType détermine
// ensuite le dashboard vers lequel l'utilisateur est routé :
//   - airport    → AirportDashboard (wallboard, ops room)
//   - airline    → AirlineDashboard (escale & passagers)
//   - vip_lounge → VIPDashboard (luxe & discrétion)
//   - classic    → ProDashboard (restaurant, hôtel…)
//
// Lecture défensive de User.tenantType pour la migration (la colonne
// vient juste d'être ajoutée). En cas de PrismaClient en cache (schéma
// ancien avant redémarrage), on bascule sur du SQL brut.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, ok, fail } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TENANTS_VALIDES = new Set(["airport", "airline", "vip_lounge", "city", "classic"])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail("Requête invalide", 400)

    const tenantType = typeof body.tenantType === "string" ? body.tenantType.trim() : ""
    if (!TENANTS_VALIDES.has(tenantType)) {
      return fail("Type d'établissement invalide", 400)
    }

    const user = await getSessionUser(req)
    if (!user) return fail("Non authentifié", 401)

    // Tentative Prisma (cas nominal : PrismaClient à jour après db:push)
    try {
      await db.user.update({
        where: { id: user.id },
        data: { tenantType },
      })
    } catch {
      // Fallback SQL brut (PrismaClient en cache : colonne inconnue)
      await db.$executeRaw`UPDATE User SET tenantType = ${tenantType} WHERE id = ${user.id}`
    }

    return ok({ tenantType })
  } catch (e) {
    console.error("tenant update error", e)
    return fail("Erreur serveur", 500)
  }
}
