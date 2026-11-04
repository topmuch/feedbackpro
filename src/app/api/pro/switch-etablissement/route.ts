// ============================================================
// API Pro - Switch d'établissement (Task 5 : multi-établissements)
// ------------------------------------------------------------
// POST /api/pro/switch-etablissement { cibleId }
//   - Le Pro courant doit être le parent (proId null) ou un enfant du
//     même groupe. On vérifie que cibleId est dans le même groupe
//     (parent = racine ou enfant de la même racine).
//   - Crée une nouvelle Session pour le User du Pro cible et pose le
//     cookie de session. Retourne le nouveau Pro sérialisé pour que le
//     frontend rafraîchisse le store.
//
// Sécurité :
//   - Le Pro courant doit être actif (non suspendu).
//   - Le Pro cible doit être actif (non suspendu).
//   - Le Pro cible doit appartenir au même groupe (même racine).
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  ok,
  fail,
  serializePro,
  createSession,
  attachSessionCookie,
} from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"

const schema = z.object({
  cibleId: z.string().trim().min(1, "ID d'établissement cible manquant"),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { cibleId } = parsed.data

    // Racine du groupe du Pro courant
    const racineCourantId = ctx.pro.proId ?? ctx.pro.id

    // Interdit le switch vers soi-même (no-op)
    if (cibleId === ctx.pro.id) {
      return fail("Vous êtes déjà sur cet établissement.", 400)
    }

    // Récupère le Pro cible + vérifie l'appartenance au groupe
    const cible = await db.pro.findUnique({ where: { id: cibleId } })
    if (!cible) return fail("Établissement cible introuvable", 404)
    if (cible.suspendu) return fail("Établissement cible suspendu", 403)

    // La cible doit être la racine ou un enfant de la racine du groupe courant
    const racineCibleId = cible.proId ?? cible.id
    if (racineCibleId !== racineCourantId) {
      return fail("Cet établissement n'appartient pas à votre groupe.", 403)
    }

    // Vérifie que le User cible existe (cascade onDelete: le Pro n'existe
    // pas sans User). On crée une nouvelle session pour ce User.
    const userCible = await db.user.findUnique({ where: { id: cible.userId } })
    if (!userCible) return fail("Compte utilisateur introuvable pour cet établissement", 404)

    const sessionId = await createSession(userCible.id)

    const res = NextResponse.json({
      ok: true,
      data: { pro: serializePro(cible), sessionId },
    })
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("switch-etablissement error", e)
    return fail("Erreur serveur lors du switch d'établissement", 500)
  }
}

// GET /api/pro/switch-etablissement — alias de /api/pro/etablissements
// (liste le parent + les enfants + le courant). Pratique pour le header.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const racineId = ctx.pro.proId ?? ctx.pro.id
    const [racine, enfants] = await Promise.all([
      db.pro.findUnique({ where: { id: racineId } }),
      db.pro.findMany({ where: { proId: racineId }, orderBy: { createdAt: "asc" } }),
    ])
    if (!racine) return fail("Établissement racine introuvable", 404)

    return ok({
      parent: serializePro(racine),
      courant: serializePro(ctx.pro),
      enfants: enfants.map(serializePro),
    })
  } catch (e) {
    console.error("switch-etablissement GET error", e)
    return fail("Erreur serveur", 500)
  }
}
