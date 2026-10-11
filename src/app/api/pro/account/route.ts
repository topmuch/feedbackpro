// ============================================================
// API Pro - Zone dangereuse : suppression définitive du compte
// DELETE /api/pro/account
// Supprime le User (cascade : Pro, Zones, Retours, Employés,
// RapportsIA, Alertes, Commandes, Sessions) puis efface le cookie.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, clearSessionCookie } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // Détache les retours de leurs employés avant la cascade
    // (évite tout conflit de clé étrangère côté SQLite)
    await db.retour.updateMany({
      where: { proId: ctx.pro.id },
      data: { employeId: null },
    })

    // La suppression du User cascade sur tout le modèle (onDelete: Cascade)
    await db.user.delete({ where: { id: ctx.user.id } })

    // Efface le cookie de session : l'utilisateur est déconnecté
    return clearSessionCookie(ok({ deleted: true }))
  } catch (e) {
    console.error("account DELETE error", e)
    return fail("Erreur serveur lors de la suppression du compte", 500)
  }
}
