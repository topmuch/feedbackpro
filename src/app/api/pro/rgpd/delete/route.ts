// ============================================================
// API Pro - RGPD : suppression du compte + toutes les données (D9)
// POST /api/pro/rgpd/delete
// → supprime le User (cascade Prisma : Pro → Zones → Retours / Employés /
//   RapportsIA / Alertes / Commandes + Sessions + Notifications).
//   Efface aussi les fichiers uploadés liés (photos) dans la mesure du
//   possible (best-effort : la cascade ne nettoie pas public/uploads/).
// → détruit la session courante (cookie effacé) avant suppression définitive.
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { fail, clearSessionCookie } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { unlink } from "node:fs/promises"
import path from "node:path"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const userId = ctx.user.id
    const proId = ctx.pro.id

    // Récupère les URLs des photos (pour best-effort de nettoyage disque)
    const retoursAvecPhoto = await db.retour.findMany({
      where: { proId, NOT: { photoUrl: null } },
      select: { photoUrl: true },
    })

    // Détache d'abord les retours de leurs employés (cohérence SQLite)
    await db.retour.updateMany({ where: { proId }, data: { employeId: null } })

    // Suppression en cascade : User → Pro → Zones/Retours/Employés/RapportsIA/
    // Alertes/Commandes + Sessions + Notifications.
    await db.user.delete({ where: { id: userId } })

    // Best-effort : efface les photos physiques associées (non bloquant)
    for (const r of retoursAvecPhoto) {
      if (!r.photoUrl) continue
      try {
        // r.photoUrl est une URL relative "/uploads/xxx.webp"
        const chemin = path.join(process.cwd(), "public", r.photoUrl)
        await unlink(chemin)
      } catch {
        /* silencieux : le fichier est peut-être déjà supprimé ou inaccessible */
      }
    }

    const res = NextResponse.json({ ok: true, data: { supprime: true } })
    // Efface le cookie de session : la session a été détruite en cascade
    return clearSessionCookie(res)
  } catch (e) {
    console.error("RGPD delete error", e)
    return fail("Erreur serveur lors de la suppression", 500)
  }
}
