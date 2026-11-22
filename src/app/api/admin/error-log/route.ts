// ============================================================
// FeedVoice - Consultation du journal d'erreurs (superadmin)
// GET /api/admin/error-log
// ------------------------------------------------------------
// { ok, data: { total, erreurs: EntreeErreur[] } } — les 200 dernières
// erreurs client/serveur en mémoire (ring buffer volatile).
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { listerErreurs, compterErreurs } from "@/lib/error-log"

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const erreurs = listerErreurs(200)
    return ok({
      total: compterErreurs(),
      erreurs,
    })
  } catch (e) {
    console.error("admin error-log error", e)
    return fail("Erreur serveur", 500)
  }
}
