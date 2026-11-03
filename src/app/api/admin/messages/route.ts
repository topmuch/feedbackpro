// ============================================================
// API Superadmin - Messages de contact (model Message)
// ------------------------------------------------------------
// GET  /api/admin/messages           → liste tous les messages
//                                       (tri : createdAt desc)
// POST /api/admin/messages           → action sur un message
//   { action: "marquerLu" | "supprimer", id }
// ------------------------------------------------------------
// Réservé au superadmin (requireAdmin). Les messages viennent du
// formulaire public POST /api/contact.
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"

const postSchema = z.object({
  action: z.enum(["marquerLu", "supprimer"], {
    message: "Action invalide (marquerLu ou supprimer)",
  }),
  id: z.string().trim().min(1, "ID manquant"),
})

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const messages = await db.message.findMany({
      orderBy: { createdAt: "desc" },
      take: 200, // garde-fou : on charge les 200 plus récents
    })

    const nonLus = messages.filter((m) => !m.lu).length

    return ok({
      messages: messages.map((m) => ({
        id: m.id,
        nom: m.nom,
        email: m.email,
        sujet: m.sujet,
        message: m.message,
        lu: m.lu,
        createdAt: m.createdAt.toISOString(),
      })),
      nonLus,
      total: messages.length,
    })
  } catch (e) {
    console.error("admin messages GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parse = postSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const { action, id } = parse.data

    if (action === "marquerLu") {
      const misAJour = await db.message.update({
        where: { id },
        data: { lu: true },
      })
      return ok({ message: { ...misAJour, createdAt: misAJour.createdAt.toISOString() } })
    }

    // action === "supprimer"
    await db.message.delete({ where: { id } })
    return ok({ supprime: true })
  } catch (e) {
    console.error("admin messages POST error", e)
    return fail("Erreur serveur", 500)
  }
}
