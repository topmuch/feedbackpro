// ============================================================
// FeedbackPro - Helper pour créer des notifications in-app (cloche)
// Strictement non bloquant : un échec d'écriture ne casse jamais le flux.
//
// Types connus :
//   PRO : nouveau_retour | retour_negatif | rapport_ia | alerte_coach
//   SUPERADMIN : nouveau_commercant | nouvelle_commande | commercant_suspendu
// ============================================================

import { db } from "@/lib/db"

export type NotificationType =
  | "nouveau_retour"
  | "retour_negatif"
  | "rapport_ia"
  | "alerte_coach"
  | "nouveau_commercant"
  | "nouvelle_commande"
  | "commercant_suspendu"

/**
 * Crée une notification pour un utilisateur (PRO ou SUPERADMIN).
 * Best-effort : aucune exception n'est propagée.
 */
export async function creerNotification(
  userId: string,
  type: NotificationType,
  titre: string,
  message: string
): Promise<void> {
  try {
    await db.notification.create({
      data: { userId, type, titre, message },
    })
  } catch (e) {
    console.warn("Notification non créée (non bloquant)", e)
  }
}

/**
 * Notifie tous les superadmins (rôle SUPERADMIN) d'un événement plateforme
 * (nouveau commerçant, nouvelle commande, suspension…).
 */
export async function notifierSuperadmins(
  type: NotificationType,
  titre: string,
  message: string
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: "SUPERADMIN", suspendu: false },
      select: { id: true },
    })
    if (admins.length === 0) return
    await db.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, type, titre, message })),
    })
  } catch (e) {
    console.warn("Notification superadmins non créée (non bloquant)", e)
  }
}
