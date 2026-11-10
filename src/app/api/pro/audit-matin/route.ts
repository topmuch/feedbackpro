// ============================================================
// Feature 2 — Auto-Audit du Matin : API Pro
// ------------------------------------------------------------
// GET  /api/pro/audit-matin
//   → génère (ou récupère si déjà complété aujourd'hui) la checklist
//     du matin basée sur les retours des dernières 24h (LLM + fallback).
//     Réponse : { audit: AuditMatin | null, checklist: ItemChecklist[],
//                 source: "ia"|"fallback", dejaComplete: boolean, donnees }
//
// POST /api/pro/audit-matin
//   → enregistre l'audit complété par le manager (items validés/invalidés
//     + photos + notes + score auto-calculé). Réponse : { audit }
//     Si un audit existe déjà pour aujourd'hui, on l'écrase (mise à jour).
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import {
  genererChecklistMatin,
  serialiserAudit,
  calculerScoreManager,
  type ItemAuditSoumis,
} from "@/lib/audit-matin"

/** Bornes du jour courant (00:00:00 → 23:59:59 en local) */
function bornesDuJour(): { debut: Date; fin: Date } {
  const now = new Date()
  const debut = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { debut, fin }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const { debut, fin } = bornesDuJour()

    // Un audit existe-t-il déjà pour aujourd'hui ?
    const existant = await db.auditMatin.findFirst({
      where: { proId: ctx.pro.id, date: { gte: debut, lte: fin } },
      orderBy: { createdAt: "desc" },
    })

    if (existant) {
      // Audit déjà complété aujourd'hui → on renvoie l'audit + la checklist
      // d'origine (items tels qu'enregistrés, validés/invalidés).
      return ok({
        audit: serialiserAudit(existant),
        checklist: null,
        source: existant.items ? "ia" : "fallback",
        dejaComplete: true,
      })
    }

    // Pas d'audit aujourd'hui → on génère la checklist du matin
    const { items, source, donnees } = await genererChecklistMatin({
      id: ctx.pro.id,
      nomEtablissement: ctx.pro.nomEtablissement,
      typeEtablissement: ctx.pro.typeEtablissement,
    })

    return ok({
      audit: null,
      checklist: items,
      source,
      dejaComplete: false,
      donnees: {
        total: donnees.total,
        totalNegatifs: donnees.totalNegatifs,
        noteMoyenne: Number(donnees.noteMoyenne.toFixed(2)),
        topTagsNegatifs: donnees.topTagsNegatifs,
        zonesProblematiques: donnees.zonesProblematiques.map((z) => ({
          zone: z.zone,
          noteMoyenne: Number(z.noteMoyenne.toFixed(2)),
          negatifs: z.negatifs,
          total: z.total,
        })),
      },
    })
  } catch (e) {
    console.error("audit-matin GET error", e)
    return fail("Erreur serveur lors de la génération de l'audit du matin", 500)
  }
}

// ---------- POST : enregistrement de l'audit complété ----------

const itemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  urgence: z.enum(["haute", "moyenne", "basse"]).optional(),
  photoRequise: z.boolean().optional(),
  valide: z.boolean(),
  photoUrl: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

const postSchema = z.object({
  items: z.array(itemSchema).min(1, "Au moins un item est requis").max(6, "6 items maximum"),
  photoUrls: z.array(z.string().trim().max(500)).max(20).optional().default([]),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Données invalides", 400)

    const { items, photoUrls, notes } = parsed.data
    const scoreManager = calculerScoreManager(items as ItemAuditSoumis[])

    const { debut, fin } = bornesDuJour()

    // Si un audit existe déjà pour aujourd'hui, on l'écrase (mise à jour)
    const existant = await db.auditMatin.findFirst({
      where: { proId: ctx.pro.id, date: { gte: debut, lte: fin } },
      orderBy: { createdAt: "desc" },
    })

    const data = {
      proId: ctx.pro.id,
      date: new Date(),
      items: JSON.stringify(items),
      photoUrls: JSON.stringify(photoUrls),
      scoreManager,
      notes: notes ?? null,
    }

    const audit = existant
      ? await db.auditMatin.update({ where: { id: existant.id }, data })
      : await db.auditMatin.create({ data })

    return ok({ audit: serialiserAudit(audit) })
  } catch (e) {
    console.error("audit-matin POST error", e)
    return fail("Erreur serveur lors de l'enregistrement de l'audit", 500)
  }
}
