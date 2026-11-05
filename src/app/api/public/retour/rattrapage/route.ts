// ============================================================
// Feature 1 — Rattrapage client : endpoint public pour enregistrer
// le nom du client sur l'écran "Rattrapage" (après envoi d'un retour
// négatif ≤ 2★). Appelé par le scan-view quand le client saisit son
// nom OU quand il clique sur "Je peux attendre" / "Je préfère partir".
//
// POST /api/public/retour/rattrapage
//   body : { retourId, nomClient? }
//   → { ok } (mise à jour du Retour + notification manager mise à jour)
//
// Sécurité : le retourId doit exister ; le nom est optionnel (≤ 120 car.).
// Aucune auth requise (le client n'est pas connecté — il scanne juste
// un QR code public). Le retourId est un cuid difficile à deviner, ce
// qui suffit à empêcher les requêtes malveillantes sur des retours
// arbitraires (l'attaquant devrait connaître le cuid d'un retour
// négatif récent d'un Pro qu'il ne possède pas).
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"

const schema = z.object({
  retourId: z.string().trim().min(1, "retourId manquant").max(64),
  nomClient: z
    .string()
    .trim()
    .max(120, "Nom trop long (120 caractères maximum)")
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Données invalides", 400)
    const { retourId, nomClient } = parsed.data

    const existing = await db.retour.findUnique({
      where: { id: retourId },
      select: {
        id: true,
        note: true,
        proId: true,
        pro: { select: { userId: true } },
        zone: { select: { nom: true } },
      },
    })
    if (!existing) return fail("Retour introuvable", 404)
    const userId = existing.pro.userId

    // Met à jour le nom du client (si fourni)
    const nomNettoye = nomClient && nomClient.trim().length > 0 ? nomClient.trim().slice(0, 120) : null
    await db.retour.update({
      where: { id: retourId },
      data: { nomClientRattrapage: nomNettoye },
    })

    // Met à jour la notification manager (titre + message) pour refléter
    // que le client est en attente de rattrapage. Best-effort : silencieux
    // si la notification n'est pas retrouvée ou si la mise à jour échoue.
    try {
      // Recherche la dernière notification de type retour_negatif pour ce
      // userId (la notification a été créée dans POST /api/retour juste
      // avant que le client n'arrive sur l'écran rattrapage).
      const notif = await db.notification.findFirst({
        where: { userId, type: "retour_negatif" },
        orderBy: { createdAt: "desc" },
        take: 1,
      })
      if (notif) {
        // Décortique le message : on conserve la partie descriptive
        // (note + tags + commentaire) et on remplace les suffixes
        // « — Client : X » / « — En attente de rattrapage » par la version
        // actualisée avec le nom (si fourni).
        const base = notif.message.split(" — Client :")[0].split(" — En attente")[0]
        const clientSuffix = nomNettoye ? ` — Client : ${nomNettoye}` : ""
        const rattrapageSuffix = " — En attente de rattrapage"
        await db.notification.update({
          where: { id: notif.id },
          data: { message: `${base}${clientSuffix}${rattrapageSuffix}|retourId=${retourId}` },
        })
      }
    } catch (e) {
      console.warn("[rattrapage] Mise à jour notification non bloquante", e)
    }

    return ok({ retourId, nomClient: nomNettoye })
  } catch (e) {
    console.error("rattrapage POST error", e)
    return fail("Erreur serveur", 500)
  }
}
