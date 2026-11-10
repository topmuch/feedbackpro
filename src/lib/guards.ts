// ============================================================
// FeedbackPro - Guards d'authentification pour les API routes
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, fail } from "@/lib/session"
import type { Pro } from "@prisma/client"

export type ProContext = {
  user: { id: string; email: string; role: string }
  pro: Pro
}

/** Message affiché à un établissement suspendu par le superadmin */
export const MESSAGE_SUSPENSION = "Votre compte a été suspendu. Contactez le support."

/**
 * Raison du dernier refus émis par requirePro, consommée par unauthorized().
 *
 * Les routes suivent toutes le pattern `if (!ctx) return unauthorized()`
 * sans paramètre : pour afficher le message dédié aux comptes suspendus (403)
 * sans modifier chaque route, requirePro lève ce drapeau juste avant de renvoyer
 * null et unauthorized() le consomme immédiatement. Entre les deux appels il n'y
 * a aucun `await` (le branchement est synchrone) : la fenêtre de concurrence est
 * négligeable et le pire cas reste bénin (un message de suspension affiché à
 * tort à une autre requête sans Pro — aucun impact de sécurité).
 */
let refusSuspensionEnCours = false

/** Vérifie que la requête provient d'un établissement (Pro) connecté */
export async function requirePro(req: NextRequest): Promise<ProContext | null> {
  const user = await getSessionUser(req)
  if (!user || user.role !== "PRO" || !user.proId) return null

  const pro = await db.pro.findUnique({ where: { id: user.proId } })
  if (!pro) return null

  // Garde-fou : un Pro suspendu perd l'accès à toutes les API Pro
  // jusqu'à sa réactivation par le superadmin.
  if (pro.suspendu) {
    refusSuspensionEnCours = true
    return null
  }

  return {
    user: { id: user.id, email: user.email, role: user.role },
    pro,
  }
}

/** Vérifie que la requête provient du superadmin */
export async function requireAdmin(req: NextRequest): Promise<{ id: string; email: string } | null> {
  const user = await getSessionUser(req)
  if (!user || user.role !== "SUPERADMIN") return null
  return { id: user.id, email: user.email }
}

/**
 * Réponse standard pour une requête non autorisée.
 * Si le refus provient d'un compte suspendu (drapeau posé par requirePro),
 * renvoie un 403 avec le message dédié au lieu du 401 générique.
 */
export const unauthorized = () => {
  if (refusSuspensionEnCours) {
    refusSuspensionEnCours = false
    return fail(MESSAGE_SUSPENSION, 403)
  }
  return fail("Non autorisé", 401)
}
