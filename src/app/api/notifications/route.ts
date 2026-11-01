// ============================================================
// API Notifications in-app (cloche)
// GET  /api/notifications           → liste des 10 dernières notifications de l'utilisateur courant
// GET  /api/notifications?all=1     → toutes les notifications (max 50)
// POST /api/notifications           { id?, all? } → marquer comme lu (une ou toutes)
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail, getSessionUser } from "@/lib/session"
import { firstError } from "@/lib/validation"

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return fail("Non autorisé", 401)

    const sp = req.nextUrl.searchParams
    const all = sp.get("all") === "1"
    const limit = all ? 50 : 10

    const notifs = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    const nonLues = await db.notification.count({
      where: { userId: user.id, lu: false },
    })

    return ok({
      notifications: notifs.map((n) => ({
        id: n.id,
        type: n.type,
        titre: n.titre,
        message: n.message,
        lu: n.lu,
        createdAt: n.createdAt.toISOString(),
      })),
      nonLues,
    })
  } catch (e) {
    console.error("notifications GET error", e)
    return fail("Erreur serveur", 500)
  }
}

const postSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || !!v.id, "ID manquant")

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return fail("Non autorisé", 401)

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { id, all } = parsed.data

    if (all) {
      await db.notification.updateMany({
        where: { userId: user.id, lu: false },
        data: { lu: true },
      })
    } else if (id) {
      await db.notification.updateMany({
        where: { id, userId: user.id },
        data: { lu: true },
      })
    }

    const nonLues = await db.notification.count({
      where: { userId: user.id, lu: false },
    })
    return ok({ nonLues })
  } catch (e) {
    console.error("notifications POST error", e)
    return fail("Erreur serveur", 500)
  }
}
