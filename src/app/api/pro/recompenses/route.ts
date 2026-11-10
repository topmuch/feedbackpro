// ============================================================
// API Pro - Configuration des micro-récompenses clients (Session 3)
// GET  /api/pro/recompenses → { recompense: { active, type, code, texte } }
// POST /api/pro/recompenses
//      { recompenseActive, recompenseType, recompenseCode?, recompense }
//      → { pro }
//
// La récompense s'affiche au client en deux temps sur la page de scan :
//   1. Étape 3 (AVANT envoi)  : teaser texte sans le code promo
//   2. Écran de remerciement  : texte + CODE PROMO mis en valeur
// Le texte (`recompense`) est le libellé SANS code ; le code promo est
// stocké séparément (`recompenseCode`) pour ne jamais être révélé avant
// l'envoi effectif du retour.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, serializePro } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { z } from "zod"

const recompenseSchema = z.object({
  recompenseActive: z.boolean(),
  recompenseType: z.enum(["cafe", "reduction", "produit", "goodie", "autre"], {
    message: "Type de récompense invalide",
  }),
  recompenseCode: z
    .string()
    .trim()
    .max(32, "Code promo trop long")
    .transform((v) => v.toUpperCase())
    .optional()
    .default(""),
  recompense: z.string().trim().max(120, "Récompense trop longue").optional().default(""),
  recompenseLimite: z
    .string()
    .trim()
    .max(60, "Limite d'utilisation trop longue")
    .optional()
    .default(""),
})

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // ---------- Stats d'utilisation (audit UX) ----------
    // Récompenses distribuées = retours créés ce mois-ci (approximation :
    // on suppose que la récompense était active lorsqu'elle est activée aujourd'hui).
    // Récompenses utilisées = retours avec recompenseUtilisee = true ce mois-ci.
    const debutMois = new Date()
    debutMois.setDate(1)
    debutMois.setHours(0, 0, 0, 0)
    const [distribueesCeMois, utiliseesCeMois] = await Promise.all([
      db.retour.count({ where: { proId: ctx.pro.id, createdAt: { gte: debutMois } } }),
      db.retour.count({
        where: {
          proId: ctx.pro.id,
          createdAt: { gte: debutMois },
          recompenseUtilisee: true,
        },
      }),
    ])
    const tauxUtilisation = distribueesCeMois > 0 ? Math.round((utiliseesCeMois / distribueesCeMois) * 100) : 0

    // recompenseLimite : colonne ajoutée après le démarrage du serveur de dev.
    // Tant que le Prisma Client n'est pas rechargé, on lit la valeur via SQL brut.
    let limite = ""
    try {
      const rows = await db.$queryRaw<
        Array<{ recompenseLimite: string | null }>
      >`SELECT recompenseLimite FROM Pro WHERE id = ${ctx.pro.id}`
      limite = rows[0]?.recompenseLimite ?? ""
    } catch {
      /* silencieux : colonne peut ne pas exister en base */
    }

    return ok({
      recompense: {
        active: ctx.pro.recompenseActive,
        type: ctx.pro.recompenseType,
        code: ctx.pro.recompenseCode,
        texte: ctx.pro.recompense ?? "",
        limite,
      },
      stats: {
        distribueesCeMois,
        utiliseesCeMois,
        tauxUtilisation,
      },
    })
  } catch (e) {
    console.error("recompenses GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = recompenseSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Données invalides", 400)
    }
    const { recompenseActive, recompenseType, recompenseCode, recompense, recompenseLimite } = parsed.data

    // Cohérence : une récompense active DOIT avoir un texte affichable
    if (recompenseActive && !recompense) {
      return fail("Indiquez le texte à afficher au client (ex. « ☕ Café offert sur votre prochaine visite »)", 400)
    }

    const updated = await db.pro.update({
      where: { id: ctx.pro.id },
      data: {
        recompenseActive,
        recompenseType,
        recompenseCode: recompenseCode || "",
        // Le texte reste stocké même si le toggle est coupé : la
        // configuration est conservée pour une réactivation facile
        recompense: recompense || null,
      },
    })

    // recompenseLimite : colonne ajoutée après le démarrage du serveur de dev.
    // Tant que le Prisma Client n'est pas rechargé, on écrit la valeur via SQL
    // brut (cf. commentaire src/lib/db.ts).
    try {
      await db.$executeRaw`UPDATE Pro SET recompenseLimite = ${
        recompenseLimite || null
      } WHERE id = ${ctx.pro.id}`
    } catch (e) {
      console.warn("recompenseLimite non persisté (colonne absente ?)", e)
    }

    return ok({ pro: serializePro(updated) })
  } catch (e) {
    console.error("recompenses POST error", e)
    return fail("Erreur serveur", 500)
  }
}
