// ============================================================
// API Superadmin - Réglages de la plateforme (model Setting)
// GET   /api/admin/settings → crée les valeurs par défaut si la table est vide
// PATCH /api/admin/settings → upsert des clés fournies (clés autorisées uniquement)
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"

/** Clés de réglages gérées par le superadmin (Session 5) */
export const CLES_SETTINGS = ["nomPlateforme", "urlPublique", "emailSupport", "seuilAlerte"] as const

const DEFAUTS: Record<(typeof CLES_SETTINGS)[number], string> = {
  nomPlateforme: "FeedbackPro",
  urlPublique: "",
  emailSupport: "support@feedbackpro.fr",
  seuilAlerte: "2",
}

const patchSchema = z
  .object({
    nomPlateforme: z.string().trim().min(1, "Le nom de la plateforme est requis").max(80).optional(),
    urlPublique: z.union([z.url("URL publique invalide"), z.literal("")]).optional(),
    emailSupport: z.string().trim().pipe(z.email("Email de support invalide")).optional(),
    seuilAlerte: z
      .union([z.number().int().min(1, "Seuil invalide (1 à 5)").max(5, "Seuil invalide (1 à 5)"), z.string().regex(/^[1-5]$/, "Seuil invalide (1 à 5)")])
      .transform((v) => String(v))
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucun réglage fourni")

/** Crée les valeurs par défaut manquantes puis renvoie la liste complète */
async function settingsAvecDefauts() {
  const existantes = await db.setting.findMany({ orderBy: { key: "asc" } })
  const manquantes = Object.entries(DEFAUTS).filter(([key]) => !existantes.some((s) => s.key === key))
  if (manquantes.length > 0) {
    await db.setting.createMany({
      data: manquantes.map(([key, value]) => ({ key, value })),
    })
  }
  return db.setting.findMany({ orderBy: { key: "asc" } })
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const settings = await settingsAvecDefauts()
    return ok({ settings })
  } catch (e) {
    console.error("admin settings GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parse = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const body = parse.data

    const updates = Object.entries(body).filter(([key, value]) => value !== undefined) as [
      (typeof CLES_SETTINGS)[number],
      string,
    ][]

    // Upsert des clés fournies (les clés inconnues sont ignorées par le schéma Zod)
    await db.$transaction(
      updates.map(([key, value]) =>
        db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    )

    const settings = await settingsAvecDefauts()
    return ok({ settings })
  } catch (e) {
    console.error("admin settings PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
